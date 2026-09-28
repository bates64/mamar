import { SongPosition, TrackMute } from "./SongPlayer"

/** The globals papermario-dx reads and writes to play Mamar's song (see its src/dx/mamar.h). */
export const MAMAR_SYMBOL_NAMES = [
    "MamarEnabled",
    "MamarReady",
    "MamarBGM",
    "MamarBGMSize",
    "MamarVariation",
    "MamarBankSong",
    "MamarRequest",
    "MamarPaused",
    "MamarAmbience",
    "MamarTrackMute",
    "MamarTempo",
    "MamarStartSegment",
    "MamarStartTick",
    "MamarSegment",
    "MamarTick",
] as const

export type MamarSymbols = Record<(typeof MAMAR_SYMBOL_NAMES)[number], number>

/** An emulated game's memory, in the order bytes appear in the game's own address space. */
export interface EmulatorMemory {
    read(address: number, size: number): Promise<Uint8Array>
    write(address: number, data: Uint8Array): void
}

/** MamarReady's value once the game has booted (MAMAR_READY). */
const READY = 0x4d414d52

/** Largest encoded BGM the game's buffer for Mamar's song holds (MAMAR_BGM_MAX_SIZE). */
export const MAX_BGM_SIZE = 0x5000

const TRACK_MUTE_VALUES: Record<TrackMute, number> = {
    none: 0,
    mute: 1,
    solo: 2,
}

const BOOT_POLL_MS = 100

/** Plays Mamar's song in a papermario-dx ROM, through its memory. */
export default class DxMamar {
    private request = 0

    private constructor(
        private readonly memory: EmulatorMemory,
        private readonly symbols: MamarSymbols,
        private readonly bgmAddress: number,
    ) {}

    /** Waits for the game to boot, then switches it to playing Mamar's songs. */
    static async connect(memory: EmulatorMemory, symbols: MamarSymbols, timeoutMs = 20_000): Promise<DxMamar> {
        const deadline = Date.now() + timeoutMs
        const readUntil = async (address: number, done: (value: number) => boolean): Promise<number | undefined> => {
            while (Date.now() < deadline) {
                try {
                    const value = await readU32(memory, address)
                    if (done(value)) {
                        return value
                    }
                } catch {
                    // The emulator isn't reachable yet.
                }
                await new Promise(resolve => setTimeout(resolve, BOOT_POLL_MS))
            }
        }

        // Writing memory while the game boots can stop it booting, so only read until it's ready.
        if (await readUntil(symbols.MamarReady, value => value === READY) === undefined) {
            throw new Error("The game didn't boot")
        }
        writeU32(memory, symbols.MamarEnabled, 1)
        const bgmAddress = await readUntil(symbols.MamarBGM, value => value !== 0)
        if (bgmAddress === undefined) {
            throw new Error("The game didn't get ready to play songs")
        }
        return new DxMamar(memory, symbols, bgmAddress)
    }

    /**
     * Plays an encoded BGM from `start`, loading the auxiliary banks of the song with ID `bankSong` (-1 for none). The
     * game plays the song silently up to `start`, without repeating loops.
     */
    play(bgm: Uint8Array, variation: number, bankSong: number, start: SongPosition = { segment: 0, tick: 0 }) {
        if (bgm.length > MAX_BGM_SIZE) {
            throw new Error(`The song is too large to play: ${bgm.length} bytes, but the game holds ${MAX_BGM_SIZE}`)
        }
        this.memory.write(this.bgmAddress, bgm)
        writeU32(this.memory, this.symbols.MamarBGMSize, bgm.length)
        writeU32(this.memory, this.symbols.MamarVariation, variation)
        writeU32(this.memory, this.symbols.MamarBankSong, bankSong)
        writeU32(this.memory, this.symbols.MamarStartSegment, start.segment)
        writeU32(this.memory, this.symbols.MamarStartTick, start.tick)
        this.request++
        writeU32(this.memory, this.symbols.MamarRequest, this.request)
    }

    setPaused(paused: boolean) {
        writeU32(this.memory, this.symbols.MamarPaused, paused ? 1 : 0)
    }

    setAmbientSound(sound: number) {
        writeU32(this.memory, this.symbols.MamarAmbience, sound)
    }

    setTrackMutes(mutes: readonly TrackMute[]) {
        const data = new Uint8Array(mutes.length * 4)
        const view = new DataView(data.buffer)
        mutes.forEach((mute, i) => view.setUint32(i * 4, TRACK_MUTE_VALUES[mute]))
        this.memory.write(this.symbols.MamarTrackMute, data)
    }

    /** Beats per minute of the song playing. */
    async readTempo(): Promise<number> {
        return await readU32(this.memory, this.symbols.MamarTempo) / 100
    }

    /** Where the song playing is, or null if none is. */
    async readPosition(): Promise<SongPosition | null> {
        const [segment, tick] = await Promise.all([
            readU32(this.memory, this.symbols.MamarSegment),
            readU32(this.memory, this.symbols.MamarTick),
        ])
        return segment === 0xFFFFFFFF ? null : { segment, tick }
    }
}

async function readU32(memory: EmulatorMemory, address: number): Promise<number> {
    const data = await memory.read(address, 4)
    if (data.length < 4) {
        throw new Error(`Couldn't read 0x${address.toString(16)}`)
    }
    return new DataView(data.buffer, data.byteOffset).getUint32(0)
}

function writeU32(memory: EmulatorMemory, address: number, value: number) {
    const data = new Uint8Array(4)
    new DataView(data.buffer).setUint32(0, value >>> 0)
    memory.write(address, data)
}
