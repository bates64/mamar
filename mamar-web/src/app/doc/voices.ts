import { Bgm, TrackList, Voices } from "pm64-typegen"
import { getUntrackedObject } from "react-tracked"

import Bridge from "../bridge"
import { useBgm } from "../store"

/** Voices the game has for a phrase's tracks, as in pm64. */
export const MAX_VOICES = 24

/** Voices already worked out for each track list, as every thumbnail of a segment asks for its track list's. */
const cache = new WeakMap<TrackList, { branches: Bgm["branches"], voices: Voices }>()

/** The voices each track of track list `trackListId` needs and gets. */
export function useVoices(trackListId: number): Voices | undefined {
    const [bgm] = useBgm()
    const tracked = bgm?.track_lists[trackListId]
    if (!tracked || !bgm) {
        return undefined
    }
    // The objects under react-tracked's proxies are the same while the track list and branches are
    const trackList = getUntrackedObject(tracked) ?? tracked
    const branches = getUntrackedObject(bgm.branches) ?? bgm.branches
    const cached = cache.get(trackList)
    if (cached?.branches === branches) {
        return cached.voices
    }
    const voices: Voices = Bridge.track_list_voices(trackList, branches)
    cache.set(trackList, { branches, voices })
    return voices
}

export function total(voices: number[]): number {
    return voices.reduce((sum, count) => sum + count, 0)
}
