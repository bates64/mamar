import classNames from "classnames"

import styles from "./Ruler.module.scss"
import { useSnap } from "./snap"
import { useTime } from "./TimeProvider"

import { useDoc } from "../store"
import { Cycle } from "../store/doc"

/** Tells a cycle apart from the song's own loops, which change the song. */
export const CYCLE_DESCRIPTION = "Cycle (C): repeats this part while you listen. It doesn't change the song."

/** How far the pointer moves along the ruler before a press becomes a drag, in pixels. */
const DRAG_THRESHOLD_PX = 4

type Drag = { kind: "mark", from: number } | { kind: "start" | "end", cycle: Cycle }

/**
 * Marks and changes the cycle by dragging along the ruler, snapping to the grid unless Shift is held.
 */
export function useCycleDrag() {
    const [, dispatch] = useDoc()
    const time = useTime()
    const [, snap] = useSnap()

    function beginDrag(event: React.MouseEvent, drag: Drag) {
        if (event.button !== 0) return
        const startX = event.clientX
        let dragged = false

        const onMove = (e: MouseEvent) => {
            if (!dragged && Math.abs(e.clientX - startX) < DRAG_THRESHOLD_PX) return
            dragged = true

            const ticks = snap(time.xToTicks(e.clientX), e.shiftKey)
            let cycle: Cycle
            switch (drag.kind) {
            case "mark":
                cycle = { start: Math.min(drag.from, ticks), end: Math.max(drag.from, ticks), isEnabled: true }
                break
            case "start":
                cycle = { ...drag.cycle, start: Math.min(ticks, drag.cycle.end) }
                break
            case "end":
                cycle = { ...drag.cycle, end: Math.max(ticks, drag.cycle.start) }
                break
            }
            if (cycle.end > cycle.start) {
                dispatch({ type: "set_cycle", cycle })
            }
        }
        const onUp = () => {
            window.removeEventListener("mousemove", onMove)
            window.removeEventListener("mouseup", onUp)
        }
        window.addEventListener("mousemove", onMove)
        window.addEventListener("mouseup", onUp)
    }

    return {
        /** Starts marking a new cycle from where `event` pressed. */
        beginMark(event: React.MouseEvent) {
            beginDrag(event, { kind: "mark", from: snap(time.xToTicks(event.clientX), event.shiftKey) })
        },
        beginDrag,
    }
}

function cycleStyle(cycle: Cycle): React.CSSProperties {
    return {
        left: `calc(${cycle.start}px / var(--ruler-zoom))`,
        width: `calc(${cycle.end - cycle.start}px / var(--ruler-zoom))`,
    }
}

/**
 * The cycle in the strip along the top of the ruler, where dragging marks one. Clicking it turns cycling on or off,
 * and dragging its edges moves them.
 */
export default function CycleStrip({ drag }: { drag: ReturnType<typeof useCycleDrag> }) {
    const [doc, dispatch] = useDoc()
    const cycle = doc?.cycle
    if (!cycle) return null

    return <div
        className={classNames(styles.cycleStrip, { [styles.cycleDisabled]: !cycle.isEnabled })}
        style={cycleStyle(cycle)}
        title={CYCLE_DESCRIPTION}
        onMouseDown={e => e.stopPropagation()}
        onClick={() => dispatch({ type: "set_cycle", cycle: { ...cycle, isEnabled: !cycle.isEnabled } })}
    >
        {(["start", "end"] as const).map(kind => <div
            key={kind}
            className={styles.cycleEdge}
            data-edge={kind}
            onMouseDown={e => {
                e.stopPropagation()
                drag.beginDrag(e, { kind, cycle })
            }}
            onClick={e => e.stopPropagation()}
        />)}
    </div>
}

/** The cycle shaded over the bars of the ruler, so it's clear which bars it repeats. */
export function CycleShade() {
    const [doc] = useDoc()
    const cycle = doc?.cycle
    if (!cycle) return null

    return <div className={classNames(styles.cycleShade, { [styles.cycleDisabled]: !cycle.isEnabled })} style={cycleStyle(cycle)} />
}
