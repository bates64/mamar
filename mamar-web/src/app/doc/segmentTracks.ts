import { Bgm, Event, PatchAddress } from "pm64-typegen"
import { useMemo } from "react"
import { getUntrackedObject } from "react-tracked"

import { LaneKind, lanePoints, lastValue, timeline, trackLanes } from "./lanes"

import Bridge from "../bridge"
import { useBgm, useLocation, useVariation } from "../store"
import { branchesPlayedBy, playingTrack, variesByMix } from "../store/bgm"

/**
 * Each track's commands with the time each plays at, by its commands. Every lane and greyed segment needs every
 * segment's, which would otherwise be worked out again for each of them.
 */
const timelines = new WeakMap<Event[], { time: number, event: Event }[]>()

function cachedTimeline(commands: Event[]): { time: number, event: Event }[] {
    const key = getUntrackedObject(commands) ?? commands
    let played = timelines.get(key)
    if (!played) {
        played = timeline(commands)
        timelines.set(key, played)
    }
    return played
}

/**
 * What each track's commands play in each proximity mix, by its commands, as working it out reads every branch, and
 * whether they vary by mix at all.
 */
const mixCommands = new WeakMap<Event[], { branches: Bgm["branches"], varies: boolean, byMix: Map<number, Event[]> }>()

function cachedMixCommands(commands: Event[], branches: Bgm["branches"]) {
    const key = getUntrackedObject(commands) ?? commands
    const untrackedBranches = getUntrackedObject(branches) ?? branches
    let cached = mixCommands.get(key)
    if (cached?.branches !== untrackedBranches) {
        cached = { branches: untrackedBranches, varies: variesByMix(key), byMix: new Map() }
        mixCommands.set(key, cached)
    }
    return { key, cached }
}

/** Whether `commands` play a passage of their own in each proximity mix. */
export function commandsVaryByMix(commands: Event[], branches: Bgm["branches"]): boolean {
    return cachedMixCommands(commands, branches).cached.varies
}

/**
 * `commands` as they play in proximity mix `mix`: each branch plays the mix's passage, so a track that varies by mix
 * shows and edits one mix at a time. Commands that don't vary are `commands` themselves.
 */
export function commandsForMix(commands: Event[], branches: Bgm["branches"], mix: number): Event[] {
    const { key, cached } = cachedMixCommands(commands, branches)
    if (!cached.varies) {
        return commands
    }
    let played = cached.byMix.get(mix)
    if (!played) {
        played = Bridge.commands_for_mix(key, branchesPlayedBy(key, cached.branches), mix) as Event[]
        cached.byMix.set(mix, played)
    }
    return played
}

/** `commands` as they play in the proximity mix being listened to. See {@link commandsForMix}. */
export function useMixCommands(commands: Event[] | undefined): Event[] | undefined {
    const [bgm] = useBgm()
    const [location] = useLocation()
    return commands && bgm ? commandsForMix(commands, bgm.branches, location.mix) : commands
}

/** A track in one segment of the variation, and its commands with the time each plays at. */
export interface SegmentTrack {
    trackListId: number
    trackIndex: number
    played: { time: number, event: Event }[]
}

/**
 * Track `mainIndex` in each segment of the active variation, as it plays: its alternate part when those play. Segments
 * that don't play a phrase, such as loops, are null.
 */
export function useSegmentTracks(mainIndex: number): (SegmentTrack | null)[] {
    const [bgm] = useBgm()
    const [variation] = useVariation()
    const [location] = useLocation()

    return useMemo(() => (variation?.segments ?? []).map(segment => {
        const trackList = bgm && "Subseg" in segment ? bgm.track_lists[segment.Subseg.track_list] : undefined
        if (!trackList || !("Subseg" in segment)) {
            return null
        }
        const trackIndex = playingTrack(trackList, mainIndex, location.alternateParts)
        return { trackListId: segment.Subseg.track_list, trackIndex, played: cachedTimeline(commandsForMix(trackList.tracks[trackIndex].commands, bgm!.branches, location.mix)) }
    }), [bgm, variation, mainIndex, location.alternateParts, location.mix])
}

/** A value a track keeps from an earlier segment, as segments don't reset the values a track has. */
export interface CarriedValue {
    kind: LaneKind
    value: number
}

/**
 * The values track `mainIndex` has when segment `segmentIndex` starts, from the segments before it on the timeline, and
 * the patch it overrides its instrument with, if any. A loop can play segments in another order, so these are what
 * the track has the first time through.
 */
export function useCarriedValues(mainIndex: number, segmentIndex: number): { values: CarriedValue[], patch: PatchAddress | null } {
    const [bgm] = useBgm()
    const segments = useSegmentTracks(mainIndex)

    return useMemo(() => {
        const earlier = segments.slice(0, segmentIndex).flatMap(segment => segment?.played ?? [])
        // Choosing one of the song's instruments and overriding the patch each replace the other
        const instruments = earlier.filter(({ event }) => "SetTrackVoice" in event || "TrackOverridePatch" in event)
        const lastInstrument = instruments[instruments.length - 1]?.event
        const values = (bgm ? trackLanes(bgm) : []).flatMap(kind => {
            const value = lastValue(lanePoints(kind, earlier))
            const isReplaced = kind.key === "instrument" && lastInstrument !== undefined && "TrackOverridePatch" in lastInstrument
            return value !== undefined && !isReplaced ? [{ kind, value }] : []
        })
        const patch = lastInstrument && "TrackOverridePatch" in lastInstrument ? lastInstrument.TrackOverridePatch : null
        return { values, patch }
    }, [bgm, segments, segmentIndex])
}
