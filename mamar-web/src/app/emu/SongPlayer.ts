import { createContext, useContext, useEffect } from "react"

/** Whether a track plays: `solo` silences every track that isn't soloed. */
export type TrackMute = "none" | "mute" | "solo"

/** A point in a song's variation. */
export interface SongPosition {
    /** Index of a segment in the variation. */
    segment: number
    /** Ticks into that segment. */
    tick: number
}

export interface PlayerStatus {
    /** Beats per minute. */
    tempo: number
    /** Where the song playing is, or null if none is. */
    position: SongPosition | null
    /** How long after the song reaches a position it's heard there, in ms. */
    latency: number
}

/**
 * Plays songs. Each method takes effect as soon as it can, which might be after it returns.
 */
export interface SongPlayer {
    /** Plays an encoded BGM from `start`, or from its start if not given, replacing whatever is playing. */
    load(bgm: Uint8Array, variation: number, start?: SongPosition): void | Promise<void>
    setPaused(paused: boolean): void | Promise<void>
    setTrackMute(track: number, mute: TrackMute): void
    /** Sets the proximity mix, as au_bgm_set_proximity_mix takes it, and whether alternate parts play. */
    setLocation(proximityMix: number, alternateParts: boolean): void
    /** Calls `listener` with the player's status every frame until disposed. */
    onStatus(listener: (status: PlayerStatus) => void): () => void
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
