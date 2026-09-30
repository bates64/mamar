import { createContext, useContext } from "react"

import { TICKS_PER_BEAT, usePickup, useTicksPerBar } from "./Ruler"

import { useDoc } from "../store"
import { DEFAULT_SNAP, Snap } from "../store/doc"

export const SNAP_NAMES: Record<Snap, string> = {
    bar: "Bar",
    beat: "1/4",
    eighth: "1/8",
    sixteenth: "1/16",
    off: "Off",
}

/** Where the segment that times are in starts in the variation, in ticks, or 0 for times in the whole variation. */
export const SegmentStart = createContext(0)

/**
 * The snap setting, a function that snaps a time in ticks to it, and the grid's size in ticks. Pass `free` to place
 * without snapping. The grid counts from bar 1, which starts after the pickup, if the variation has one.
 */
export function useSnap(): [Snap, (ticks: number, free?: boolean) => number, number] {
    const [doc] = useDoc()
    const ticksPerBar = useTicksPerBar()
    const pickup = usePickup()
    const segmentStart = useContext(SegmentStart)
    const snap = doc?.snap ?? DEFAULT_SNAP
    const grid = { bar: ticksPerBar, beat: TICKS_PER_BEAT, eighth: TICKS_PER_BEAT / 2, sixteenth: TICKS_PER_BEAT / 4, off: 1 }[snap]
    // Where a grid line is, in the segment's times
    const line = pickup - segmentStart
    return [snap, (ticks, free = false) => {
        if (free) return Math.max(0, Math.round(ticks))
        return Math.max(0, line + Math.round((ticks - line) / grid) * grid)
    }, grid]
}
