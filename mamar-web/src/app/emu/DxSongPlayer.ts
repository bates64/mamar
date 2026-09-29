import AudioLatencyMeter, { EmulatorAudio } from "./AudioLatencyMeter"
import DxMamar from "./DxMamar"
import { PlayerStatus, SongPlayer, SongPosition, TrackMute } from "./SongPlayer"

const STATUS_POLL_MS = 50

/** AMBIENT_SILENCE */
const DEFAULT_AMBIENT_SOUND = 6

/** Plays songs in a papermario-dx ROM once it's connected, holding whatever's asked of it until then. */
export default class DxSongPlayer implements SongPlayer {
    private mamar?: DxMamar
    private song?: { bgm: Uint8Array, variation: number, start?: SongPosition }
    private paused = true
    private ambientSound = DEFAULT_AMBIENT_SOUND
    private readonly trackMutes: TrackMute[] = new Array(16).fill("none")
    private readonly listeners = new Set<(status: PlayerStatus) => void>()
    private statusTimer?: ReturnType<typeof setInterval>
    private latencyMeter?: AudioLatencyMeter

    /** `audio` gives where the game's audio goes, if the host can tell, so the player can measure its latency. */
    constructor(
        connection: Promise<DxMamar>,
        private readonly bankSong = -1,
        private readonly audio?: () => EmulatorAudio | undefined,
    ) {
        connection.then(
            mamar => {
                this.mamar = mamar
                this.apply(true)
            },
            error => console.error("Couldn't connect to the game", error),
        )
    }

    load(bgm: Uint8Array, variation: number, start?: SongPosition) {
        this.song = { bgm, variation, start }
        this.apply(true)
    }

    setPaused(paused: boolean) {
        this.paused = paused
        this.apply(false)

        // Browsers suspend audio until the user interacts with the page. The emulator resumes it on the first key or
        // mouse press, but a keyboard shortcut that plays can keep that press from reaching it.
        const context = this.audio?.()?.context
        if (!paused && context?.state === "suspended") {
            context.resume()
        }
    }

    setAmbientSound(sound: number) {
        this.ambientSound = sound
        this.apply(false)
    }

    setTrackMute(track: number, mute: TrackMute) {
        this.trackMutes[track] = mute
        this.apply(false)
    }

    onStatus(listener: (status: PlayerStatus) => void): () => void {
        this.listeners.add(listener)
        this.statusTimer ??= setInterval(() => this.pollStatus(), STATUS_POLL_MS)
        return () => {
            this.listeners.delete(listener)
            if (this.listeners.size === 0) {
                clearInterval(this.statusTimer)
                this.statusTimer = undefined
            }
        }
    }

    private apply(song: boolean) {
        const mamar = this.mamar
        if (!mamar) {
            return
        }
        mamar.setPaused(this.paused)
        mamar.setAmbientSound(this.ambientSound)
        mamar.setTrackMutes(this.trackMutes)
        if (song && this.song) {
            mamar.play(this.song.bgm, this.song.variation, this.bankSong, this.song.start)
            this.measureLatency(mamar)
        }
    }

    private measureLatency(mamar: DxMamar) {
        const audio = this.audio?.()
        if (!audio) {
            return
        }
        this.latencyMeter ??= new AudioLatencyMeter(audio)

        const deadline = performance.now() + 2000
        this.latencyMeter.measure(new Promise(resolve => {
            const poll = async () => {
                if (await mamar.readNotesStarted() > 0) {
                    resolve(performance.now())
                } else if (performance.now() > deadline) {
                    resolve(undefined)
                } else {
                    requestAnimationFrame(poll)
                }
            }
            requestAnimationFrame(poll)
        }))
    }

    private async pollStatus() {
        if (!this.mamar) {
            return
        }
        const [tempo, position] = await Promise.all([this.mamar.readTempo(), this.mamar.readPosition()])
        const latency = this.latencyMeter?.latency
        for (const listener of this.listeners) {
            listener({ tempo, position, latency })
        }
    }
}
