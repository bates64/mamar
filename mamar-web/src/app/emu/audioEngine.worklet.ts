// Runs papermario-dx's audio engine, compiled to WebAssembly by mamar-audio, on the audio thread.

import type { SongCycle, SongPosition } from "./SongPlayer"

declare const currentTime: number
declare const sampleRate: number
declare class AudioWorkletProcessor {
    readonly port: MessagePort
    constructor(options?: unknown)
}
declare function registerProcessor(name: string, processor: new (options: any) => AudioWorkletProcessor): void

export interface AudioEngineOptions {
    /** mamar_audio.wasm */
    wasm: ArrayBuffer
    /** The ROM's sound bank (SBN), which the engine reads as its ROM. */
    sbn: ArrayBuffer
}

export type AudioEngineMessage =
    | { type: "play", bgm: Uint8Array, variation: number, start: SongPosition }
    | { type: "pause", paused: boolean }
    | { type: "mutes", muteMask: number, soloMask: number }
    | { type: "location", proximityMix: number, alternateParts: boolean }
    | { type: "cycle", cycle: SongCycle | null }
    | { type: "volume", volume: number }

export interface AudioEngineStatus {
    /** Beats per minute. */
    tempo: number
    position: SongPosition | null
    /** The audio context time when `position` is heard. */
    heardAt: number
}

interface Exports {
    memory: WebAssembly.Memory
    mamar_audio_init(): void
    mamar_audio_output(): number
    mamar_audio_render_frame(): number
    mamar_audio_bgm_buffer(): number
    mamar_audio_play(size: number, variation: number, bankSong: number, startSegment: number, startTick: number): void
    mamar_audio_set_proximity_mix(mix: number): void
    mamar_audio_set_alternate_parts(enabled: number): void
    mamar_audio_set_track_mutes(muteMask: number, soloMask: number): void
    mamar_audio_segment(): number
    mamar_audio_tick(): number
    mamar_audio_tempo(): number
}

/** How often to report the song's position, in seconds. */
const STATUS_INTERVAL = 0.05

/** Room for the samples of two video frames and a block of output, as interleaved stereo. */
const PENDING_SIZE = 4096

/** How long pausing and resuming fade the output for, in seconds, as stopping or starting it at once would click. */
const FADE_TIME = 0.005

class AudioEngineProcessor extends AudioWorkletProcessor {
    private readonly engine: Exports
    /**
     * Samples the engine has rendered that haven't been output yet, as interleaved stereo in a ring buffer, which
     * doesn't allocate as it plays so the garbage collector never interrupts the audio thread.
     */
    private readonly pending = new Float32Array(PENDING_SIZE)
    private readStart = 0
    private pendingLength = 0
    private paused = true
    /** How loud the output is, which fades towards 0 while paused and 1 otherwise. */
    private gain = 0
    private lastStatus = -Infinity
    private volume = 1
    /** The song last played, which a cycle plays again from its start. */
    private song: { size: number, variation: number } | null = null
    private cycle: SongCycle | null = null

    constructor({ processorOptions }: { processorOptions: AudioEngineOptions }) {
        super()
        const sbn = new Uint8Array(processorOptions.sbn)

        const instance = new WebAssembly.Instance(new WebAssembly.Module(processorOptions.wasm), {
            env: {
                sbn_read: (addr: number, dst: number, size: number) => {
                    new Uint8Array(this.engine.memory.buffer, dst, size).set(sbn.subarray(addr, addr + size))
                },
            },
        })
        this.engine = instance.exports as unknown as Exports
        this.engine.mamar_audio_init()

        this.port.onmessage = ({ data }: MessageEvent<AudioEngineMessage>) => this.onMessage(data)
    }

    private onMessage(message: AudioEngineMessage) {
        const { engine } = this
        switch (message.type) {
        case "play":
            new Uint8Array(engine.memory.buffer, engine.mamar_audio_bgm_buffer(), message.bgm.length).set(message.bgm)
            this.song = { size: message.bgm.length, variation: message.variation }
            engine.mamar_audio_play(message.bgm.length, message.variation, -1, message.start.segment, message.start.tick)
            break
        case "pause":
            this.paused = message.paused
            break
        case "mutes":
            engine.mamar_audio_set_track_mutes(message.muteMask, message.soloMask)
            break
        case "cycle":
            this.cycle = message.cycle
            break
        case "volume":
            this.volume = message.volume
            break
        case "location":
            engine.mamar_audio_set_proximity_mix(message.proximityMix)
            engine.mamar_audio_set_alternate_parts(message.alternateParts ? 1 : 0)
            break
        }
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
        const [left, right] = outputs[0]
        // Once faded out, the engine stops until playback resumes
        if (this.paused && this.gain === 0) {
            return true
        }

        const fadeStep = 1 / (FADE_TIME * sampleRate)
        while (this.pendingLength < left.length * 2) {
            this.renderFrame()
        }
        for (let i = 0; i < left.length; i++) {
            this.gain = this.paused
                ? Math.max(0, this.gain - fadeStep)
                : Math.min(1, this.gain + fadeStep)
            left[i] = this.pending[this.readStart] * this.gain * this.volume
            right[i] = this.pending[this.readStart + 1] * this.gain * this.volume
            this.readStart = (this.readStart + 2) % PENDING_SIZE
        }
        this.pendingLength -= left.length * 2

        if (currentTime - this.lastStatus >= STATUS_INTERVAL) {
            this.lastStatus = currentTime
            this.postStatus((left.length + this.pendingLength / 2) / sampleRate)
        }
        return true
    }

    private renderFrame() {
        const { engine } = this
        const frames = engine.mamar_audio_render_frame()
        const output = new Int16Array(engine.memory.buffer, engine.mamar_audio_output(), frames * 2)
        let write = (this.readStart + this.pendingLength) % PENDING_SIZE

        for (let i = 0; i < output.length; i++) {
            this.pending[write] = output[i] / 0x8000
            write = (write + 1) % PENDING_SIZE
        }
        this.pendingLength += output.length
        this.repeatCycle()
    }

    /** Plays the cycle again from its start once the song reaches its end. */
    private repeatCycle() {
        const { engine, cycle, song } = this
        const segment = engine.mamar_audio_segment()
        if (!cycle || !song || segment < 0) {
            return
        }

        const tick = engine.mamar_audio_tick()
        if (segment > cycle.end.segment || (segment === cycle.end.segment && tick >= cycle.end.tick)) {
            engine.mamar_audio_play(song.size, song.variation, -1, cycle.start.segment, cycle.start.tick)
        }
    }

    /** Reports where the song is once the engine has rendered it, which is heard `delay` seconds from now. */
    private postStatus(delay: number) {
        const segment = this.engine.mamar_audio_segment()
        const status: AudioEngineStatus = {
            tempo: this.engine.mamar_audio_tempo() / 100,
            position: segment < 0 ? null : { segment, tick: this.engine.mamar_audio_tick() },
            heardAt: currentTime + delay,
        }
        this.port.postMessage(status)
    }
}

registerProcessor("audio-engine", AudioEngineProcessor)
