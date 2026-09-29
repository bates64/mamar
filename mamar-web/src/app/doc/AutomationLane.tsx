import { useRef, useState } from "react"

import styles from "./AutomationLane.module.scss"
import { LaneKind, LanePoint } from "./lanes"
import { useSnap } from "./snap"

/** Pixels a point moves before a drag chooses whether it changes time or value. */
const DRAG_THRESHOLD = 4

export interface Props {
    kind: LaneKind
    /** Ticks the lane covers. */
    length: number
    points: LanePoint[]
    /** The value held from before the lane starts, if any. */
    initial?: number
    onAdd(time: number, value: number): void
    onChange(point: LanePoint, value: number): void
    onMove(point: LanePoint, time: number): void
    onDelete(point: LanePoint): void
    /** Turns a step into a fade from the point before it, or a fade back into a step. */
    onToggleFade?(point: LanePoint, previous: LanePoint | undefined): void
    /** Whether to label the lane inside it, for lanes without a label beside them. */
    showName?: boolean
    /** Called when a point is clicked without dragging, to inspect it. */
    onSelect?(point: LanePoint): void
    /** The ID of the selected event, if it's in this lane. */
    selectedId?: number
}

interface Drag {
    point: LanePoint
    startX: number
    startY: number
    /** What the drag changes, once it has moved far enough to tell. */
    axis: "time" | "value" | null
    time: number
    value: number
}

/**
 * Shows commands that set a value over time. Click to add a point, drag a point sideways to move it or up and down to
 * change its value, double-click it to delete it, and Alt-click it to switch between a step and a fade. Points snap to
 * the grid unless Shift is held.
 */
export default function AutomationLane({
    kind, length, points, initial, onAdd, onChange, onMove, onDelete, onToggleFade, showName = true, onSelect, selectedId,
}: Props) {
    const ref = useRef<HTMLDivElement>(null)
    const [dragging, setDragging] = useState<Drag | null>(null)
    const [, snap] = useSnap()

    const range = kind.max - kind.min
    const clamp = (value: number) => Math.min(kind.max, Math.max(kind.min, Math.round(value)))
    const yOf = (value: number) => 100 - ((value - kind.min) / range) * 100
    const leftOf = (time: number) => `${(time / length) * 100}%`
    const valueAt = (clientY: number) => {
        const rect = ref.current!.getBoundingClientRect()
        return clamp(kind.min + (1 - (clientY - rect.top) / rect.height) * range)
    }
    const format = (value: number) => kind.format?.(value) ?? String(value)

    const ticksAt = (clientX: number) => {
        const rect = ref.current!.getBoundingClientRect()
        return ((clientX - rect.left) / rect.width) * length
    }

    const shown = points
        .map(point => (dragging?.point.event.id === point.event.id ? { ...point, time: dragging.time, value: dragging.value } : point))
        .sort((a, b) => a.time - b.time)

    // The line holds each value until the next point, or ramps to it over a fade
    const line: [number, number][] = []
    let value = initial
    if (value !== undefined) {
        line.push([0, value])
    }
    for (const point of shown) {
        if (value !== undefined) {
            line.push([point.time, value])
        }
        line.push([point.time + (point.fade ?? 0), point.value])
        value = point.value
    }
    if (value !== undefined) {
        line.push([length, value])
    }

    return <div
        ref={ref}
        className={styles.lane}
        aria-label={kind.name}
        onPointerDown={event => {
            if (event.button !== 0 || event.target !== ref.current) {
                return
            }
            onAdd(Math.min(snap(ticksAt(event.clientX), event.shiftKey), length), valueAt(event.clientY))
        }}
    >
        {showName && <span className={styles.name}>{kind.name}</span>}
        {kind.display === "line" ? <svg className={styles.line} viewBox={`0 0 ${length} 100`} preserveAspectRatio="none" aria-hidden="true">
            <polyline points={line.map(([time, value]) => `${time},${yOf(value)}`).join(" ")} />
        </svg> : shown.map((point, i) => {
            const end = shown[i + 1]?.time ?? length
            return <span
                key={`span_${point.event.id}`}
                className={styles.span}
                style={{ left: leftOf(point.time), width: `${((end - point.time) / length) * 100}%` }}
            >
                {format(point.value)}
            </span>
        })}
        {shown.map((point, i) => <span
            key={point.event.id}
            className={styles.point}
            data-fade={point.fade !== undefined}
            data-selected={point.event.id === selectedId}
            style={{
                left: leftOf(point.time + (point.fade ?? 0)),
                top: kind.display === "line" ? `${yOf(point.value)}%` : "50%",
            }}
            title={`${format(point.value)}${point.fade !== undefined ? ` over ${point.fade} ticks` : ""}. Drag sideways to move or up and down to change, double-click to delete${onToggleFade ? ", Alt-click to switch between a step and a fade" : ""}.`}
            onPointerDown={event => {
                event.stopPropagation()
                if (event.altKey && onToggleFade) {
                    onToggleFade(point, shown[i - 1])
                    return
                }
                event.currentTarget.setPointerCapture(event.pointerId)
                setDragging({ point, startX: event.clientX, startY: event.clientY, axis: null, time: point.time, value: point.value })
            }}
            onPointerMove={event => {
                if (dragging?.point.event.id !== point.event.id) {
                    return
                }
                const dx = event.clientX - dragging.startX
                const dy = event.clientY - dragging.startY
                const axis = dragging.axis ?? (Math.max(Math.abs(dx), Math.abs(dy)) > DRAG_THRESHOLD ? (Math.abs(dx) > Math.abs(dy) ? "time" : "value") : null)
                if (axis === "time") {
                    const width = ref.current!.getBoundingClientRect().width
                    const time = Math.min(length, snap(dragging.point.time + (dx / width) * length, event.shiftKey))
                    setDragging({ ...dragging, axis, time })
                } else if (axis === "value") {
                    setDragging({ ...dragging, axis, value: valueAt(event.clientY) })
                }
            }}
            onPointerUp={() => {
                if (dragging?.point.event.id === point.event.id) {
                    // `point` is drawn where it's being dragged to, so compare with where it started
                    const original = dragging.point
                    if (dragging.time !== original.time) {
                        onMove(original, dragging.time)
                    } else if (dragging.value !== original.value) {
                        onChange(original, dragging.value)
                    } else if (dragging.axis === null) {
                        onSelect?.(original)
                    }
                    setDragging(null)
                }
            }}
            onDoubleClick={event => {
                event.stopPropagation()
                onDelete(point)
            }}
        />)}
        {dragging?.axis === "value" && <span className={styles.readout} style={{ left: leftOf(dragging.time) }}>{format(dragging.value)}</span>}
    </div>
}
