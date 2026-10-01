import { Bgm, TrackList, VoiceReport, Voices } from "pm64-typegen"
import { getUntrackedObject } from "react-tracked"

import Bridge from "../bridge"
import { useBgm, useLocation } from "../store"

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

/** Voice reports already worked out for each track list, by the branches and mix they were worked out for. */
const reportCache = new WeakMap<TrackList, { branches: Bgm["branches"], mix: number, report: VoiceReport }>()

/**
 * The voices each track of track list `trackListId` needs and gets, and where each needs them, as the mix being
 * listened to plays it.
 */
export function useVoiceReport(trackListId: number): VoiceReport | undefined {
    const [bgm] = useBgm()
    const [{ mix }] = useLocation()
    const tracked = bgm?.track_lists[trackListId]
    if (!tracked || !bgm) {
        return undefined
    }
    const trackList = getUntrackedObject(tracked) ?? tracked
    const branches = getUntrackedObject(bgm.branches) ?? bgm.branches
    const cached = reportCache.get(trackList)
    if (cached?.branches === branches && cached.mix === mix) {
        return cached.report
    }
    const report: VoiceReport = Bridge.track_list_voice_report(trackList, branches, mix)
    reportCache.set(trackList, { branches, mix, report })
    return report
}

/** Whether a phrase needing `voices` needs more voices than the game has, which cuts notes off. */
export function isOverBudget(voices: Voices): boolean {
    return total(voices.needed) > MAX_VOICES
}
