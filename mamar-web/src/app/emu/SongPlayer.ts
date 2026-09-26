import { createContext, useContext, useEffect } from "react"

/** Whether a track plays: `solo` silences every track that isn't soloed. */
export type TrackMute = "none" | "mute" | "solo"

export interface PlayerStatus {
    /** Beats per minute. */
    tempo: number
}

/**
 * Plays songs in an emulated game. Each method takes effect in the game as
 * soon as it can, which might be after it returns.
 */
export interface SongPlayer {
    /** Plays an encoded BGM from its start, replacing whatever is playing. */
    load(bgm: Uint8Array, variation: number): void | Promise<void>
    setPaused(paused: boolean): void | Promise<void>
    setAmbientSound(sound: number): void
    setTrackMute(track: number, mute: TrackMute): void
    /** Calls `listener` with the player's status every frame until disposed. */
    onStatus(listener: (status: PlayerStatus) => void): () => void
    /**
     * Calls `listener` when playback stops without a call to setPaused, such
     * as when another player takes over the emulator.
     */
    onStop?(listener: () => void): () => void
}

export const SongPlayerContext = createContext<SongPlayer | null>(null)

export default function useSongPlayer(onStatus?: (status: PlayerStatus) => void): SongPlayer {
    const player = useContext(SongPlayerContext)

    if (!player) {
        throw new Error("useSongPlayer must be used within a SongPlayerContext")
    }

    useEffect(() => {
        if (onStatus) {
            return player.onStatus(onStatus)
        }
    }, [player, onStatus])

    return player
}
