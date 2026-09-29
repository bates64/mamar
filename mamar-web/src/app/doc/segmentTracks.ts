import { Event, PatchAddress } from "pm64-typegen"
import { useMemo } from "react"
import { getUntrackedObject } from "react-tracked"

import { LaneKind, lanePoints, lastValue, timeline, trackLanes } from "./lanes"

import { useBgm, useLocation, useVariation } from "../store"
import { playingTrack } from "../store/bgm"

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
        return { trackListId: segment.Subseg.track_list, trackIndex, played: cachedTimeline(trackList.tracks[trackIndex].commands) }
    }), [bgm, variation, mainIndex, location.alternateParts])
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
