import { Voices } from "pm64-typegen"
import { useMemo } from "react"

import Bridge from "../bridge"
import { useBgm } from "../store"

/** Voices the game has for a phrase's tracks, as in pm64. */
export const MAX_VOICES = 24

/** The voices each track of track list `trackListId` needs and gets. */
export function useVoices(trackListId: number): Voices | undefined {
    const [bgm] = useBgm()
    const trackList = bgm?.track_lists[trackListId]
    const branches = bgm?.branches
    return useMemo(
        () => (trackList && branches ? Bridge.track_list_voices(trackList, branches) : undefined),
        [trackList, branches],
    )
}

export function total(voices: number[]): number {
    return voices.reduce((sum, count) => sum + count, 0)
}
