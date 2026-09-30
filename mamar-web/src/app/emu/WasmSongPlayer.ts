import type { AudioEngineMessage, AudioEngineOptions, AudioEngineReady, AudioEngineStatus } from "./audioEngine.worklet"
import workletUrl from "./audioEngine.worklet?worker&url"
import { PlayerStatus, SongCycle, SongPlayer, SongPosition, TrackMute } from "./SongPlayer"

import wasmUrl from "../../../../mamar-audio/build/mamar_audio.wasm?url"

/** The rate papermario-dx's audio engine outputs at, in Hz. */
const SAMPLE_RATE = 32000

/** Plays songs with papermario-dx's audio engine, which runs on the audio thread using a ROM's instruments. */
export default class WasmSongPlayer implements SongPlayer {
    private readonly context = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: "interactive" })
    private readonly node: Promise<AudioWorkletNode>
    private readonly trackMutes: TrackMute[] = new Array(16).fill("none")
    private readonly listeners = new Set<(status: PlayerStatus) => void>()
    readonly auxBankCount: Promise<number>
    private onReady!: (ready: AudioEngineReady) => void

    /**
     * `sbn` is the sound bank (SBN) of the ROM whose instruments songs play with. `engine` is mamar-audio's build of the
     * engine to play them with, if not Mamar's own, such as one built from a mod's copy of papermario-dx.
     */
    constructor(sbn: ArrayBuffer, engine?: ArrayBuffer) {
        this.auxBankCount = new Promise<AudioEngineReady>(resolve => this.onReady = resolve).then(ready => ready.auxBankCount)
        this.node = this.start(sbn, engine)
        this.node.catch(error => console.error("Couldn't start the audio engine", error))
    }

    private async start(sbn: ArrayBuffer, engine?: ArrayBuffer): Promise<AudioWorkletNode> {
        const [wasm] = await Promise.all([
            engine ?? fetch(wasmUrl).then(response => response.arrayBuffer()),
            this.context.audioWorklet.addModule(workletUrl),
        ])
        const processorOptions: AudioEngineOptions = { wasm, sbn }
        const node = new AudioWorkletNode(this.context, "audio-engine", {
            numberOfInputs: 0,
            outputChannelCount: [2],
            processorOptions,
        })
        node.port.onmessage = ({ data }: MessageEvent<AudioEngineReady | AudioEngineStatus>) => {
            if ("auxBankCount" in data) {
                this.onReady(data)
            } else {
                this.onEngineStatus(data)
            }
        }
        node.connect(this.context.destination)
        return node
    }

    private post(message: AudioEngineMessage) {
        this.node.then(node => node.port.postMessage(message))
    }

    load(bgm: Uint8Array, variation: number, start: SongPosition, auxBanks: number[]) {
        this.post({ type: "play", bgm, variation, start, auxBanks })
    }

    setPaused(paused: boolean) {
        this.post({ type: "pause", paused })

        // Browsers keep audio suspended until the user interacts with the page
        if (!paused && this.context.state === "suspended") {
            this.context.resume()
        }
    }

    setTrackMute(track: number, mute: TrackMute) {
        this.trackMutes[track] = mute

        let muteMask = 0
        let soloMask = 0
        this.trackMutes.forEach((mute, i) => {
            if (mute === "mute") muteMask |= 1 << i
            if (mute === "solo") soloMask |= 1 << i
        })
        this.post({ type: "mutes", muteMask, soloMask })
    }

    setLocation(proximityMix: number, alternateParts: boolean) {
        this.post({ type: "location", proximityMix, alternateParts })
    }

    setCycle(cycle: SongCycle | null) {
        this.post({ type: "cycle", cycle })
    }

    setVolume(volume: number) {
        this.post({ type: "volume", volume })
    }

    onStatus(listener: (status: PlayerStatus) => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    private onEngineStatus({ tempo, position, heardAt, levels }: AudioEngineStatus) {
        const latency = this.heardAt(heardAt) - performance.now()
        for (const listener of this.listeners) {
            listener({ tempo, position, latency, levels })
        }
    }

    /** When audio at `contextTime` is heard, as a performance.now() time. */
    private heardAt(contextTime: number): number {
        const timestamp = this.context.getOutputTimestamp()
        if (timestamp.contextTime !== undefined && timestamp.performanceTime) {
            return timestamp.performanceTime + (contextTime - timestamp.contextTime) * 1000
        }
        const outputLatency = this.context.baseLatency + (this.context.outputLatency || 0)
        return performance.now() + (contextTime - this.context.currentTime + outputLatency) * 1000
    }
}
