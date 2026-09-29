import { Event } from "pm64-typegen"
import { ReactNode, useRef, useState } from "react"

import styles from "./AutomationLane.module.scss"
import { useSnap } from "./snap"
import { segmentOf } from "./useLaneEditing"

import Bridge from "../bridge"
import { useBgm, useDoc } from "../store"

/** Pixels a marker moves before a drag moves it. */
const DRAG_THRESHOLD = 4

/**
 * Commands as labeled markers. Click one to inspect it, drag it to move it, and double-click it to delete it. Clicking
 * empty space calls `onAddAt`, if given. Markers snap to the grid unless Shift is held.
 */
export default function CommandMarkers({ name, trackListId, trackIndex, length, events, label, onAddAt, children }: {
    name: string
    trackListId: number
    trackIndex: number
    length: number
    events: { time: number, event: Event }[]
    label(event: Event): string
    onAddAt?(time: number): void
    /** Shown over the lane, such as a chooser for what to add. */
    children?: ReactNode
}) {
    const [bgm, dispatch] = useBgm()
    const [doc, docDispatch] = useDoc()
    const [, snap] = useSnap()
    const ref = useRef<HTMLDivElement>(null)
    const [drag, setDrag] = useState<{ id: number, startX: number, time: number, moved: boolean } | null>(null)
    const target = { trackList: trackListId, track: trackIndex }
    const selection = doc?.selection
    const selectedId = selection?.trackList === trackListId && selection.track === trackIndex ? selection.event : undefined

    const ticksAt = (clientX: number) => {
        const rect = ref.current!.getBoundingClientRect()
        return ((clientX - rect.left) / rect.width) * length
    }

    return <div
        ref={ref}
        className={styles.lane}
        aria-label={name}
        onPointerDown={event => {
            if (onAddAt && event.button === 0 && event.target === ref.current) {
                onAddAt(Math.min(length, snap(ticksAt(event.clientX), event.shiftKey)))
            }
        }}
    >
        <span className={styles.name}>{name}</span>
        {events.map(({ time, event }) => {
            const shownTime = drag?.id === event.id ? drag.time : time
            return <span
                key={event.id}
                className={styles.marker}
                data-selected={event.id === selectedId}
                style={{ left: `${(shownTime / length) * 100}%` }}
                title="Click to inspect, drag to move, double-click to delete"
                onPointerDown={e => {
                    e.stopPropagation()
                    e.currentTarget.setPointerCapture(e.pointerId)
                    setDrag({ id: event.id, startX: e.clientX, time, moved: false })
                }}
                onPointerMove={e => {
                    if (drag?.id !== event.id) return
                    const moved = drag.moved || Math.abs(e.clientX - drag.startX) > DRAG_THRESHOLD
                    if (moved) {
                        const dx = ((e.clientX - drag.startX) / ref.current!.getBoundingClientRect().width) * length
                        setDrag({ ...drag, moved, time: Math.min(length, snap(time + dx, e.shiftKey)) })
                    }
                }}
                onPointerUp={() => {
                    if (drag?.id !== event.id) return
                    if (drag.moved && drag.time !== time) {
                        const fields = event as unknown as Record<string, unknown>
                        const variant = Object.keys(fields).find(key => key !== "id")!
                        dispatch({
                            type: "place_track_command",
                            ...target,
                            id: event.id,
                            time: drag.time,
                            command: (fields[variant] === null ? variant : { [variant]: fields[variant] }) as never,
                        })
                    } else if (!drag.moved) {
                        docDispatch({ type: "set_selection", selection: { ...target, event: event.id } })
                        if (trackIndex === 0) {
                            docDispatch({ type: "set_panel_content", panelContent: { type: "tracker", trackList: trackListId, track: 0, segment: segmentOf(doc, trackListId) } })
                        }
                    }
                    setDrag(null)
                }}
                onDoubleClick={() => {
                    const commands = bgm?.track_lists[trackListId]?.tracks[trackIndex]?.commands ?? []
                    const index = Bridge.commands_without_detours(commands).findIndex((e: Event) => e.id === event.id)
                    if (index >= 0) {
                        dispatch({ type: "delete_track_command", ...target, index })
                    }
                }}
            >
                {label(event)}
            </span>
        })}
        {children}
    </div>
}
