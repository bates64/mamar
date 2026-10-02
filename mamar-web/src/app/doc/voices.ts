import { Bgm, TrackList, VoiceReport, Voices } from "pm64-typegen"
import { getUntrackedObject } from "react-tracked"

import Bridge from "../bridge"
import { useBgm, useLocation } from "../store"

/** Voices the game has for a phrase's tracks, as in pm64. */
export const MAX_VOICES = 24

/**
 * Voices only music plays on. Sound effects take the voices after these whenever they play, cutting off the notes the
 * music is playing on them.
 */
export const MUSIC_VOICES = 16

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
    // The objects under react-tracked's proxies are the same while the track list and branches are
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

export function total(voices: number[]): number {
    return voices.reduce((sum, count) => sum + count, 0)
}

/**
 * How a phrase's voices fit: all on the music's own voices, some on the voices sound effects take, or more than the
 * game has, so tracks get fewer than they need.
 */
export type Budget = "fits" | "shared" | "over"

export function budget(voices: Voices): Budget {
    const needed = total(voices.needed)
    return needed > MAX_VOICES ? "over" : needed > MUSIC_VOICES ? "shared" : "fits"
}

/**
 * The voices track `index` plays on, from `first` up to but not including `end`, counting from 0. The game gives each
 * track its voices after those of the tracks before it.
 */
export function voiceRange(voices: Voices, index: number): { first: number, end: number } {
    const first = total(voices.given.slice(0, index))
    return { first, end: first + voices.given[index] }
}

/** Whether track `index` plays on any of the voices sound effects take. */
export function sharesVoices(voices: Voices, index: number): boolean {
    const { first, end } = voiceRange(voices, index)
    return end > first && end > MUSIC_VOICES
}
