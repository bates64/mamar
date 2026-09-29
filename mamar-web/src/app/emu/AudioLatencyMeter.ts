/** Where an emulator sends its audio. */
export interface EmulatorAudio {
    context: AudioContext
    /** A ScriptProcessorNode that the emulator fills with each block of its output. */
    node: ScriptProcessorNode
}

/** Samples quieter than this count as silence. */
const SILENCE = 0.002

/** How long output must have been silent for a song's first sound to be told apart from what came before, in ms. */
const QUIET_BEFORE_MS = 200

/** How long to wait for a song's first sound before giving up on measuring it, in ms. */
const TIMEOUT_MS = 2000

/** How many measurements the latency is the median of. A note that fades in makes a measurement too long. */
const MEASUREMENTS = 5

/**
 * Measures how long after the game plays a note it's heard, by timing when a song that starts after silence first
 * makes a sound.
 */
export default class AudioLatencyMeter {
    private readonly measurements: number[] = []

    /** When the most recent sound is heard, as a performance.now() time. */
    private lastSound = -Infinity
    /** Called with when each block with sound in it starts being heard. */
    private onSound?: (heardAt: number) => void

    constructor(private readonly audio: EmulatorAudio) {
        audio.node.addEventListener("audioprocess", event => this.onBlock(event))
    }

    /**
     * Measures a song that starts now. `firstNoteStarted` resolves with when the game started the song's first note,
     * as a performance.now() time. Does nothing if there's sound playing that the song's could be confused with.
     */
    measure(firstNoteStarted: Promise<number | undefined>) {
        if (this.lastSound > performance.now() - QUIET_BEFORE_MS) {
            return
        }

        const firstSound = new Promise<number | undefined>(resolve => {
            const timeout = setTimeout(() => resolve(undefined), TIMEOUT_MS)
            this.onSound = heardAt => {
                clearTimeout(timeout)
                resolve(heardAt)
            }
        })

        Promise.all([firstNoteStarted, firstSound]).then(([started, heard]) => {
            this.onSound = undefined
            if (started !== undefined && heard !== undefined && heard >= started) {
                this.measurements.push(heard - started)
                this.measurements.splice(0, this.measurements.length - MEASUREMENTS)
            }
        })
    }

    /** How long after the game plays a note it's heard, in ms, or undefined before the first measurement. */
    get latency(): number | undefined {
        if (this.measurements.length === 0) {
            return undefined
        }
        const sorted = [...this.measurements].sort((a, b) => a - b)
        return sorted[Math.floor(sorted.length / 2)]
    }

    private onBlock(event: AudioProcessingEvent) {
        const data = event.outputBuffer.getChannelData(0)
        const first = data.findIndex(sample => Math.abs(sample) > SILENCE)
        if (first < 0) {
            return
        }

        const heardAt = this.heardAt(event.playbackTime + first / event.outputBuffer.sampleRate)
        this.lastSound = Math.max(this.lastSound, this.heardAt(event.playbackTime + event.outputBuffer.duration))
        this.onSound?.(heardAt)
    }

    /** When audio at `contextTime` is heard, as a performance.now() time. */
    private heardAt(contextTime: number): number {
        const { context } = this.audio
        const timestamp = context.getOutputTimestamp()
        if (timestamp.contextTime !== undefined && timestamp.performanceTime) {
            return timestamp.performanceTime + (contextTime - timestamp.contextTime) * 1000
        }
        const outputLatency = context.baseLatency + (context.outputLatency || 0)
        return performance.now() + (contextTime - context.currentTime + outputLatency) * 1000
    }
}
