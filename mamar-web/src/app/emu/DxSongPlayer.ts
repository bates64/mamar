import DxMamar from "./DxMamar"
import { PlayerStatus, SongPlayer, TrackMute } from "./SongPlayer"

const STATUS_POLL_MS = 100

/** AMBIENT_SILENCE */
const DEFAULT_AMBIENT_SOUND = 6

/** Plays songs in a papermario-dx ROM once it's connected, holding whatever's asked of it until then. */
export default class DxSongPlayer implements SongPlayer {
    private mamar?: DxMamar
    private song?: { bgm: Uint8Array, variation: number }
    private paused = true
    private ambientSound = DEFAULT_AMBIENT_SOUND
    private readonly trackMutes: TrackMute[] = new Array(16).fill("none")
    private readonly listeners = new Set<(status: PlayerStatus) => void>()
    private statusTimer?: ReturnType<typeof setInterval>

    constructor(connection: Promise<DxMamar>, private readonly bankSong = -1) {
        connection.then(
            mamar => {
                this.mamar = mamar
                this.apply(true)
            },
            error => console.error("Couldn't connect to the game", error),
        )
    }

    load(bgm: Uint8Array, variation: number) {
        this.song = { bgm, variation }
        this.apply(true)
    }

    setPaused(paused: boolean) {
        this.paused = paused
        this.apply(false)
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
            mamar.play(this.song.bgm, this.song.variation, this.bankSong)
        }
    }

    private async pollStatus() {
        if (!this.mamar) {
            return
        }
        const tempo = await this.mamar.readTempo()
        for (const listener of this.listeners) {
            listener({ tempo })
        }
    }
}
