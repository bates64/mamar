import { PatchAddress } from "pm64-typegen"

/**
 * Finds the sound bank (SBN) in a Paper Mario ROM, which holds its music and the instruments it plays, or returns
 * null if it has none. Mods can move and resize it, so it's found by its signature.
 */
export function findSoundBank(rom: ArrayBuffer): ArrayBuffer | null {
    const bytes = new Uint8Array(rom)
    const view = new DataView(rom)

    for (let i = 0; i + 8 <= bytes.length; i += 0x10) {
        // "SBN "
        if (bytes[i] === 0x53 && bytes[i + 1] === 0x42 && bytes[i + 2] === 0x4E && bytes[i + 3] === 0x20) {
            return rom.slice(i, i + view.getUint32(i + 4))
        }
    }
    return null
}

const BANK_SETS: PatchAddress["bank_set"][] = ["Aux", "Set2", "Default", "Music", "Set4", "Set5", "Set6", "AuxCopy"]

/**
 * The patches of the drum kit that every song's percussion can play, from the sound bank's PER file: the drums that
 * pitches 0x80 to 0xC7 play. The song's own drums follow them.
 */
export function kitDrums(sbn: ArrayBuffer): PatchAddress[] {
    const view = new DataView(sbn)
    const fileCount = view.getUint32(0x14)
    const init = view.getUint32(0x24)
    if (init === 0) {
        return []
    }
    // The INIT file lists the sound effects, drum kit, and instrument files, in that order
    const extraFiles = init + view.getUint16(init + 0x10)
    const perIndex = view.getUint16(extraFiles + 2)
    if (perIndex >= fileCount) {
        return []
    }
    const per = view.getUint32(0x40 + perIndex * 8) & 0xFFFFFF
    const size = view.getUint32(per + 4)

    const drums: PatchAddress[] = []
    for (let offset = 0x10; offset + 12 <= size; offset += 12) {
        const rawBank = view.getUint8(per + offset)
        const rawPatch = view.getUint8(per + offset + 1)
        drums.push({
            bank_set: BANK_SETS[(rawBank & 0x70) >> 4],
            bank: rawPatch >> 4,
            instrument: rawPatch & 0xF,
            envelope: rawBank & 3,
        })
    }
    return drums
}

/** The name of file `index` of the sound bank, such as "GM03", or undefined if it has no such file. */
export function fileName(sbn: ArrayBuffer, index: number): string | undefined {
    const view = new DataView(sbn)
    if (index >= view.getUint32(0x14)) {
        return undefined
    }
    const file = view.getUint32(0x40 + index * 8) & 0xFFFFFF
    return String.fromCharCode(...new Uint8Array(sbn, file + 8, 4))
}

/** The index of the sound bank's file named `name`, or undefined if it has none. */
export function fileIndexOf(sbn: ArrayBuffer, name: string): number | undefined {
    const count = new DataView(sbn).getUint32(0x14)
    for (let i = 0; i < count; i++) {
        if (fileName(sbn, i) === name) {
            return i
        }
    }
    return undefined
}

/** The sound bank's file index of each of `names`, the BK files a song loads into its aux banks, or 0 for none. */
export function auxBankIndexes(sbn: ArrayBuffer | null, names: string[] = []): number[] {
    return names.map(name => (sbn && name ? fileIndexOf(sbn, name) ?? 0 : 0))
}

/** A BK file a song can load into an aux bank, with the instruments it has. */
export interface AuxBankFile {
    name: string
    instruments: number[]
}

const auxBankFilesCache = new WeakMap<ArrayBuffer, AuxBankFile[]>()

/**
 * The BK files that songs can load into their aux banks: those the INIT file doesn't load into a bank of its own, which
 * the ROM's songs load theirs from.
 */
export function auxBankFiles(sbn: ArrayBuffer): AuxBankFile[] {
    const cached = auxBankFilesCache.get(sbn)
    if (cached) {
        return cached
    }
    const view = new DataView(sbn)
    const fileCount = view.getUint32(0x14)
    const init = view.getUint32(0x24)
    const files: AuxBankFile[] = []
    if (init === 0) {
        return files
    }

    const loaded = new Set<number>()
    const bankList = init + view.getUint16(init + 0x08)
    for (let entry = bankList; entry + 4 <= bankList + view.getUint16(init + 0x0A); entry += 4) {
        const fileIndex = view.getUint16(entry)
        if (fileIndex === 0xFFFF) break
        loaded.add(fileIndex)
    }

    for (let i = 0; i < fileCount; i++) {
        const file = view.getUint32(0x40 + i * 8) & 0xFFFFFF
        // "BK  "
        if (loaded.has(i) || view.getUint32(file) !== 0x424B2020) continue
        const instruments = []
        for (let instrument = 0; instrument < 16; instrument++) {
            if (view.getUint16(file + 0x12 + instrument * 2) !== 0) {
                instruments.push(instrument)
            }
        }
        files.push({ name: fileName(sbn, i)!, instruments })
    }

    auxBankFilesCache.set(sbn, files)
    return files
}

/** The songs of the INIT file's song list: the BGM file each plays, and the BK files it loads into its aux banks. */
function songEntries(sbn: ArrayBuffer): { bgmFile: number, bkFiles: number[] }[] {
    const view = new DataView(sbn)
    const init = view.getUint32(0x24)
    const songs = []
    if (init === 0) {
        return []
    }
    const songList = init + view.getUint16(init + 0x0C)
    for (let entry = songList; entry + 8 <= songList + view.getUint16(init + 0x0E); entry += 8) {
        const bgmFile = view.getUint16(entry)
        if (bgmFile === 0xFFFF) break
        songs.push({ bgmFile, bkFiles: [1, 2, 3].map(i => view.getUint16(entry + i * 2)) })
    }
    return songs
}

/**
 * The BK files the ROM's song whose BGM file is `bgm` loads into its aux banks, by name, with an empty name for a bank it
 * leaves empty, or none if it isn't one of the ROM's songs.
 */
export function romAuxBanks(sbn: ArrayBuffer, bgm: Uint8Array): string[] {
    const view = new DataView(sbn)
    for (const { bgmFile, bkFiles } of songEntries(sbn)) {
        const file = view.getUint32(0x40 + bgmFile * 8) & 0xFFFFFF
        const size = view.getUint32(file + 4)
        const data = new Uint8Array(sbn, file, size)
        if (size === bgm.length && data.every((byte, i) => byte === bgm[i])) {
            const names = bkFiles.map(index => (index === 0 ? "" : fileName(sbn, index) ?? ""))
            while (names.length > 0 && names[names.length - 1] === "") names.pop()
            return names
        }
    }
    return []
}

/** The BankSet each patch's bank set is loaded as, from the INIT file's list of banks, or undefined if it isn't. */
const INIT_BANK_SETS: Partial<Record<PatchAddress["bank_set"], number>> = { Set2: 2, Music: 3, Set4: 4, Set5: 5, Set6: 6 }

/**
 * Where the instrument `patch` plays is in the sound bank, from the banks the INIT file loads and `auxBanks`, the BK
 * files a song loads into its aux banks, or null if it isn't in one of those banks.
 */
export function instrumentOffset(sbn: ArrayBuffer, patch: PatchAddress, auxBanks: string[] = []): number | null {
    const location = instrumentLocation(sbn, patch, auxBanks)
    return location && location.bk + location.instrument
}

/** Where the BK file of the instrument `patch` plays is, and where the instrument is in it. See {@link instrumentOffset}. */
function instrumentLocation(sbn: ArrayBuffer, patch: PatchAddress, auxBanks: string[]): { bk: number, instrument: number } | null {
    const view = new DataView(sbn)
    const fileCount = view.getUint32(0x14)
    const init = view.getUint32(0x24)
    let fileIndex: number | undefined
    if (patch.bank_set === "Aux") {
        fileIndex = auxBanks[patch.bank] ? fileIndexOf(sbn, auxBanks[patch.bank]) : undefined
    } else if (init !== 0 && INIT_BANK_SETS[patch.bank_set] !== undefined) {
        const bankList = init + view.getUint16(init + 0x08)
        for (let entry = bankList; entry + 4 <= bankList + view.getUint16(init + 0x0A); entry += 4) {
            const file = view.getUint16(entry)
            if (file === 0xFFFF || file >= fileCount) break
            if (view.getUint8(entry + 2) === patch.bank && view.getUint8(entry + 3) === INIT_BANK_SETS[patch.bank_set]) {
                fileIndex = file
                break
            }
        }
    }
    if (fileIndex === undefined) {
        return null
    }
    const bk = view.getUint32(0x40 + fileIndex * 8) & 0xFFFFFF
    const instrument = view.getUint16(bk + 0x12 + patch.instrument * 2)
    return instrument === 0 ? null : { bk, instrument }
}

/** How long a video frame of the engine's is, which envelope times are multiples of, in seconds. */
const FRAME = 5750 / 1e6

/** The times an envelope step can take, by the index its command gives (AuEnvelopeIntervals), in seconds. */
const ENVELOPE_INTERVALS = [
    ...[
        60, 55, 50, 45, 40, 35, 30, 27.5, 25, 22.5, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4.5, 4, 3.5, 3,
        2.75, 2.5, 2.25, 2, 1.9, 1.8, 1.7, 1.6, 1.5, 1.4, 1.3, 1.2, 1.1, 1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55,
        0.5, 0.45, 0.4, 0.375, 0.35, 0.325, 0.3, 0.29, 0.28, 0.27, 0.26, 0.25, 0.24, 0.23, 0.22, 0.21, 0.2, 0.19, 0.18, 0.17,
        0.16, 0.15, 0.14, 0.13, 0.12, 0.11, 0.1,
    ].map(seconds => Math.floor(seconds / FRAME) * FRAME),
    ...[16, 14, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(frames => frames * FRAME),
]

/** The first envelope command that isn't a step, which loops and scales a step's volume, up to ENV_CMD_END. */
const ENV_CMD_FIRST = 0xFB
const ENV_CMD_END = 0xFF

/** One of the envelopes an instrument can play with: how long a note takes to fade out after it ends, in seconds. */
export interface Envelope {
    release: number
}

/** How long the envelope command list at `offset` takes, in seconds, as the time of each of its steps. */
function envelopeTime(view: DataView, offset: number): number {
    let time = 0
    for (let i = offset; i + 1 < view.byteLength && view.getUint8(i) !== ENV_CMD_END; i += 2) {
        const command = view.getUint8(i)
        if (command < ENV_CMD_FIRST) {
            time += ENVELOPE_INTERVALS[command] ?? 0
        }
    }
    return time
}

/** The envelopes the instrument `patch` plays can play with, or null if it isn't in one of the banks it can be in. */
export function envelopesOf(sbn: ArrayBuffer, patch: PatchAddress, auxBanks: string[] = []): Envelope[] | null {
    const location = instrumentLocation(sbn, patch, auxBanks)
    if (location === null) {
        return null
    }
    const view = new DataView(sbn)
    // An instrument's envelopes are a count, then the offsets of each one's press and release commands from the count
    const presets = location.bk + view.getUint32(location.bk + location.instrument + 0x2C)
    const envelopes = []
    for (let i = 0; i < view.getUint8(presets); i++) {
        const release = envelopeTime(view, presets + view.getUint16(presets + 6 + i * 4))
        envelopes.push({ release })
    }
    return envelopes
}
