import { useState } from "react"

import styles from "./SegmentMap.module.scss"
import { useSnap } from "./snap"

import { useBgm } from "../store"

/**
 * The end of a segment, as a line down the track list. Drag it to make the segment longer or shorter. It snaps to the
 * grid unless Shift is held.
 */
export default function SegmentEnd({ trackListId, length }: { trackListId: number, length: number }) {
    const [, dispatch] = useBgm()
    const [, snap] = useSnap()
    const [drag, setDrag] = useState<{ startX: number, ticksPerPx: number, length: number } | null>(null)

    return <div
        className={styles.segmentEnd}
        data-dragging={drag !== null}
        style={drag ? { transform: `translateX(${(drag.length - length) / drag.ticksPerPx}px)` } : undefined}
        title="Drag to change where the region ends. Hold Shift to place freely."
        data-no-drag-scroll
        onClick={event => event.stopPropagation()}
        onPointerDown={event => {
            event.stopPropagation()
            event.currentTarget.setPointerCapture(event.pointerId)
            const column = event.currentTarget.parentElement!.getBoundingClientRect()
            setDrag({ startX: event.clientX, ticksPerPx: length / column.width, length })
        }}
        onPointerMove={event => {
            if (!drag) return
            const newLength = snap(length + (event.clientX - drag.startX) * drag.ticksPerPx, event.shiftKey)
            setDrag({ ...drag, length: Math.max(1, newLength) })
        }}
        onPointerUp={() => {
            if (drag && drag.length !== length) {
                dispatch({ type: "set_segment_length", trackList: trackListId, length: drag.length })
            }
            setDrag(null)
        }}
    />
}
