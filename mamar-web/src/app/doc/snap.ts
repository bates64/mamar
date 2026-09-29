import { TICKS_PER_BEAT, useTicksPerBar } from "./Ruler"

import { useDoc } from "../store"
import { DEFAULT_SNAP, Snap } from "../store/doc"

export const SNAP_NAMES: Record<Snap, string> = {
    bar: "Bar",
    beat: "1/4",
    eighth: "1/8",
    sixteenth: "1/16",
    off: "Off",
}

/**
 * The snap setting, a function that snaps a time in ticks to it, and the grid's size in ticks. Pass `free` to place
 * without snapping.
 */
export function useSnap(): [Snap, (ticks: number, free?: boolean) => number, number] {
    const [doc] = useDoc()
    const ticksPerBar = useTicksPerBar()
    const snap = doc?.snap ?? DEFAULT_SNAP
    const grid = { bar: ticksPerBar, beat: TICKS_PER_BEAT, eighth: TICKS_PER_BEAT / 2, sixteenth: TICKS_PER_BEAT / 4, off: 1 }[snap]
    return [snap, (ticks, free = false) => Math.max(0, Math.round(ticks / (free ? 1 : grid)) * (free ? 1 : grid)), grid]
}
