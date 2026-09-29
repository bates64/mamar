import { Event } from "pm64-typegen"
import { useRef, useState } from "react"

import styles from "./AutomationLane.module.scss"

import { useBgm } from "../store"
import { useSelectedIds } from "../store/doc"

/** The highest velocity the lane shows, as in MIDI. */
const MAX_VELOCITY = 127

type NoteEvent = Event & { Note: { pitch: number, velocity: number, length: number } }

/** Each note's velocity as a bar, at the note's time. Drag a bar up or down to change it. */
export default function VelocityLane({ trackListId, trackIndex, length, played }: {
    trackListId: number
    trackIndex: number
    length: number
    played: { time: number, event: Event }[]
}) {
    const [, dispatch] = useBgm()
    const ref = useRef<HTMLDivElement>(null)
    const [drag, setDrag] = useState<{ id: number, velocity: number } | null>(null)
    const notes = played.filter((p): p is { time: number, event: NoteEvent } => "Note" in p.event)
    const selectedIds = useSelectedIds(trackListId, trackIndex)
    const isSelected = (id: number) => selectedIds.includes(id)

    const velocityAt = (clientY: number) => {
        const rect = ref.current!.getBoundingClientRect()
        return Math.round(Math.min(1, Math.max(0, 1 - (clientY - rect.top) / rect.height)) * MAX_VELOCITY)
    }

    return <div ref={ref} className={styles.lane} aria-label="Velocity">
        {notes.map(({ time, event }) => {
            const velocity = drag?.id === event.id ? drag.velocity : event.Note.velocity
            return <span
                key={event.id}
                className={styles.velocity}
                data-selected={isSelected(event.id)}
                style={{ left: `${(time / length) * 100}%`, height: `${(Math.min(velocity, MAX_VELOCITY) / MAX_VELOCITY) * 100}%` }}
                title={`Velocity ${velocity}. Drag up or down to change.`}
                onPointerDown={e => {
                    e.stopPropagation()
                    e.currentTarget.setPointerCapture(e.pointerId)
                    setDrag({ id: event.id, velocity: velocityAt(e.clientY) })
                }}
                onPointerMove={e => {
                    if (drag?.id === event.id) {
                        setDrag({ id: event.id, velocity: velocityAt(e.clientY) })
                    }
                }}
                onPointerUp={() => {
                    if (drag?.id === event.id && drag.velocity !== event.Note.velocity) {
                        dispatch({
                            type: "update_track_command",
                            trackList: trackListId,
                            track: trackIndex,
                            command: { ...(event as object), Note: { ...event.Note, velocity: drag.velocity } } as Event,
                        })
                    }
                    setDrag(null)
                }}
            />
        })}
    </div>
}
