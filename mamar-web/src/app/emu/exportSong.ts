import { Segment } from "pm64-typegen"

import wasmUrl from "../../../../mamar-audio/build/mamar_audio.wasm?url"

/** The rate papermario-dx's audio engine outputs at, in Hz. */
export const SAMPLE_RATE = 32000

/** The longest song an export renders, in seconds, in case one never ends. */
const MAX_LENGTH = 30 * 60

/** How long an export keeps rendering after a song ends, in seconds, so its last notes ring out. */
const TAIL = 3

/** How many frames an export renders before letting the page update, such as its progress. */
const FRAMES_PER_YIELD = 120

interface Engine {
    memory: WebAssembly.Memory
    mamar_audio_init(): void
    mamar_audio_output(): number
    mamar_audio_render_frame(): number
    mamar_audio_bgm_buffer(): number
    mamar_audio_play(size: number, variation: number, bankSong: number, startSegment: number, startTick: number): void
    mamar_audio_set_proximity_mix(mix: number): void
    mamar_audio_set_alternate_parts(enabled: number): void
    mamar_audio_segment(): number
    mamar_audio_tick(): number
}

/** Whether a variation's segments loop forever, as a song that plays in the background does. */
export function loopsForever(segments: Segment[]): boolean {
    return segments.some(segment => ("EndLoop" in segment && segment.EndLoop.iter_count === 0) || "EndCondLoopFalse" in segment)
}

export interface ExportOptions {
    /** The song, encoded as the game plays it. */
    bgm: Uint8Array
    variation: number
    /** The ROM's sound bank (SBN), whose instruments the song plays with. */
    sbn: ArrayBuffer
    /** The proximity mix, as au_bgm_set_proximity_mix takes it, and whether alternate parts play. */
    proximityMix: number
    alternateParts: boolean
    /** For a song that loops forever, how many times its loop plays before it fades out, and for how many seconds. */
    loops: number
    fadeSeconds: number
    /** Called with how far through the export is, from 0 to 1. */
    onProgress?(progress: number): void
}

/**
 * Renders a song with papermario-dx's audio engine, as stereo 16-bit samples at the engine's rate. A song that loops
 * forever plays its loop `loops` times and then fades out over the next `fadeSeconds`. Any other song plays until it
 * ends.
 */
export async function renderSong(options: ExportOptions, segments: Segment[]): Promise<Int16Array> {
    const { bgm, variation, sbn, proximityMix, alternateParts, loops, fadeSeconds, onProgress } = options
    const sbnBytes = new Uint8Array(sbn)
    const wasm = await fetch(wasmUrl).then(response => response.arrayBuffer())
    // The engine reads the sound bank from the host, which needs the engine's memory to write it to
    const memory: { current?: WebAssembly.Memory } = {}
    const instance = await WebAssembly.instantiate(wasm, {
        env: {
            sbn_read: (addr: number, dst: number, size: number) => {
                new Uint8Array(memory.current!.buffer, dst, size).set(sbnBytes.subarray(addr, addr + size))
            },
        },
    })
    const engine = instance.instance.exports as unknown as Engine
    memory.current = engine.memory
    engine.mamar_audio_init()

    new Uint8Array(engine.memory.buffer, engine.mamar_audio_bgm_buffer(), bgm.length).set(bgm)
    engine.mamar_audio_set_proximity_mix(proximityMix)
    engine.mamar_audio_set_alternate_parts(alternateParts ? 1 : 0)
    engine.mamar_audio_play(bgm.length, variation, -1, 0, 0)

    const isLooping = loopsForever(segments)
    const chunks: Int16Array[] = []
    let length = 0
    let hasStarted = false
    let lastSegment = -1
    let lastTick = 0
    // How many times playback has gone back to an earlier segment, or started the same one again, which is how many times
    // the loop has played
    let loopsPlayed = 0
    // Where the fade out and the tail after the song ends start, in samples
    let fadeStart: number | undefined
    let endedAt: number | undefined
    const fadeLength = Math.max(1, fadeSeconds * SAMPLE_RATE)

    for (let frame = 0; length < MAX_LENGTH * SAMPLE_RATE * 2; frame++) {
        const frames = engine.mamar_audio_render_frame()
        const samples = new Int16Array(engine.memory.buffer, engine.mamar_audio_output(), frames * 2).slice()

        const segment = engine.mamar_audio_segment()
        const tick = engine.mamar_audio_tick()
        if (segment >= 0) {
            hasStarted = true
            // A loop of one segment plays it again from its start
            if (segment < lastSegment || (segment === lastSegment && tick < lastTick)) {
                loopsPlayed++
            }
            lastSegment = segment
            lastTick = tick
        } else if (hasStarted && endedAt === undefined) {
            endedAt = length
        }
        if (isLooping && fadeStart === undefined && loopsPlayed >= loops) {
            fadeStart = length
        }

        // Fades out on a curve that sounds even, rather than one that drops away at the end
        if (fadeStart !== undefined) {
            for (let i = 0; i < samples.length; i++) {
                const t = Math.min(1, (length + i - fadeStart) / (fadeLength * 2))
                samples[i] = Math.round(samples[i] * (1 - t) ** 2)
            }
        }
        chunks.push(samples)
        length += samples.length

        if (fadeStart !== undefined && length - fadeStart >= fadeLength * 2) break
        if (endedAt !== undefined && length - endedAt >= TAIL * SAMPLE_RATE * 2) break

        if (frame % FRAMES_PER_YIELD === 0) {
            onProgress?.(progressOf(length, fadeStart, fadeLength, isLooping))
            await new Promise(resolve => setTimeout(resolve))
        }
    }

    const output = new Int16Array(length)
    let offset = 0
    for (const chunk of chunks) {
        output.set(chunk, offset)
        offset += chunk.length
    }
    onProgress?.(1)
    return trimSilence(output)
}

/** A rough measure of how far through an export is, which can only guess how long a song is until it fades. */
function progressOf(length: number, fadeStart: number | undefined, fadeLength: number, isLooping: boolean): number {
    if (fadeStart !== undefined) {
        return 0.9 + 0.1 * Math.min(1, (length - fadeStart) / (fadeLength * 2))
    }
    // Most songs are a few minutes long
    const guess = (isLooping ? 3 : 2) * 60 * SAMPLE_RATE * 2
    return 0.9 * (1 - Math.exp(-length / guess))
}

/** `samples` without the silence at their end, where the song has stopped. */
function trimSilence(samples: Int16Array): Int16Array {
    let end = samples.length
    while (end >= 2 && samples[end - 1] === 0 && samples[end - 2] === 0) {
        end -= 2
    }
    return samples.subarray(0, end)
}

/** A WAV file of stereo 16-bit `samples` at the engine's rate. */
export function encodeWav(samples: Int16Array): Blob {
    const header = new DataView(new ArrayBuffer(44))
    const writeString = (offset: number, text: string) => {
        for (let i = 0; i < text.length; i++) header.setUint8(offset + i, text.charCodeAt(i))
    }
    const channels = 2
    const bytesPerSample = 2
    const dataSize = samples.length * bytesPerSample
    writeString(0, "RIFF")
    header.setUint32(4, 36 + dataSize, true)
    writeString(8, "WAVE")
    writeString(12, "fmt ")
    header.setUint32(16, 16, true)
    header.setUint16(20, 1, true) // PCM
    header.setUint16(22, channels, true)
    header.setUint32(24, SAMPLE_RATE, true)
    header.setUint32(28, SAMPLE_RATE * channels * bytesPerSample, true)
    header.setUint16(32, channels * bytesPerSample, true)
    header.setUint16(34, bytesPerSample * 8, true)
    writeString(36, "data")
    header.setUint32(40, dataSize, true)
    return new Blob([header, samples as Int16Array<ArrayBuffer>], { type: "audio/wav" })
}
