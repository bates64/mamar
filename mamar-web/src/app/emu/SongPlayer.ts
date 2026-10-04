import { createContext, useContext, useEffect, useState } from "react"

/** Whether a track plays: `solo` silences every track that isn't soloed. */
export type TrackMute = "none" | "mute" | "solo"

/** A part of a song's variation that playback repeats. */
export interface SongCycle {
    start: SongPosition
    end: SongPosition
}

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
    /**
     * The loudest each track has played since the last status, from 0 to 1, as its left and then right channel, for
     * each of the song's 16 tracks in turn. It's heard `latency` ms from now.
     */
    levels: Float32Array
}

/**
 * Plays songs. Each method takes effect as soon as it can, which might be after it returns.
 */
export interface SongPlayer {
    /**
     * Plays an encoded BGM from `start`, replacing whatever is playing, with `auxBanks` loaded into its aux banks: the
     * sound bank's file index of each BK file, or 0 for none.
     */
    load(bgm: Uint8Array, variation: number, start: SongPosition, auxBanks: number[]): void | Promise<void>
    setPaused(paused: boolean): void | Promise<void>
    setTrackMute(track: number, mute: TrackMute): void
    /** Sets the proximity mix, as au_bgm_set_proximity_mix takes it, and whether alternate parts play. */
    setLocation(proximityMix: number, alternateParts: boolean): void
    /** Repeats `cycle` whenever playback reaches its end, or stops repeating if null. */
    setCycle(cycle: SongCycle | null): void
    /** Sets how loud everything plays, from 0 for silent to 1 for as loud as the game. */
    setVolume(volume: number): void
    /** Calls `listener` with the player's status every frame until disposed. */
    onStatus(listener: (status: PlayerStatus) => void): () => void
    /** How many aux banks a song can load its own instruments from, once the player has started. */
    readonly auxBankCount: Promise<number>
    /** The most bytes an encoded song can be for the player to play it, once the player has started. */
    readonly maxSongSize: Promise<number>
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

/** How many aux banks a song can load its own instruments from, which is 0 until the player has started. */
export function useAuxBankCount(): number {
    const player = useContext(SongPlayerContext)
    const [count, setCount] = useState(0)

    useEffect(() => {
        let isCurrent = true
        player?.auxBankCount.then(count => isCurrent && setCount(count))
        return () => {
            isCurrent = false
        }
    }, [player])

    return count
}

/** The most bytes an encoded song can be for the player to play it, or null until the player has started. */
export function useMaxSongSize(): number | null {
    const player = useContext(SongPlayerContext)
    const [size, setSize] = useState<number | null>(null)

    useEffect(() => {
        let isCurrent = true
        player?.maxSongSize.then(size => isCurrent && setSize(size))
        return () => {
            isCurrent = false
        }
    }, [player])

    return size
}
