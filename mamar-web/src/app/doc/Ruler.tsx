import classNames from "classnames"
import { Segment } from "pm64-typegen"
import { useState } from "react"

import styles from "./Ruler.module.scss"
import { useTime } from "./SegmentMap"

import { useBgm, useVariation } from "../store"

interface Loop {
    id: number
    start: number
    end: number
    iterCount: number
}

function getLoops(segments: Segment[]): Loop[] {
    const loops = []

    for (let startIdx = 0; startIdx < segments.length; startIdx++) {
        const start = segments[startIdx]
        if (start.type === "StartLoop") {
            // Look for EndLoop
            for (let endIdx = 0; endIdx < segments.length; endIdx++) {
                const end = segments[endIdx]
                if (end.type === "EndLoop" && end.label_index === start.label_index) {
                    loops.push({
                        id: start.id,
                        start: startIdx,
                        end: endIdx,
                        iterCount: end.iter_count,
                    })
                    break
                }
            }
        }
    }

    return loops
}

function LoopHandle({ segment, kind, loop, setHighlightedLoop }: {
    segment: number
    kind: "start" | "end"
    loop: Loop
    setHighlightedLoop: (id: Loop["id"] | null) => void
}) {
    const time = useTime()
    const segmentLengths = useSegmentLengths()
    const [, dispatch] = useVariation()
    const [active, setActive] = useState(false)
    return <div className={styles.relative}>
        <div
            className={classNames({
                [styles.loopHandle]: true,
                [styles.active]: active,
            })}
            data-kind={kind}
            title={`Drag to move ${kind} of loop`}
            onMouseDown={() => {
                setHighlightedLoop(loop.id)
                setActive(true)
            }}
            onMouseUp={evt => {
                const targetTime = time.xToTicks(evt.clientX)

                // Find closest segment boundary
                let curTime = 0
                let closestIndex = -1
                let closestDistance = targetTime
                segmentLengths.forEach((length, index) => {
                    curTime += length
                    const distance = Math.abs(curTime - targetTime)
                    if (distance < closestDistance) {
                        closestDistance = distance
                        closestIndex = index
                    }
                })

                if (closestDistance < 50) {
                    dispatch({
                        type: "move_segment",
                        id: segment,
                        toIndex: closestIndex + 1,
                    })
                }
                setHighlightedLoop(null)
                setActive(false)
            }}
        >
        </div>
    </div>
}

export function ticksToStyle(ticks: number) {
    return {
        width: `calc(${ticks}px / var(--ruler-zoom))`,
    }
}

// TODO: cache this better
export function useSegmentLengths(): number[] {
    const [bgm] = useBgm()
    const [variation] = useVariation()
    const segments = variation?.segments ?? []

    return segments.map(segment => {
        if (bgm && segment.type === "Subseg") {
            const master = bgm.trackLists[segment.trackList].tracks[0]
            return master.commands.vec.reduce((totalDelay, event) => {
                if (event.type === "Delay") {
                    return totalDelay + event.value
                } else {
                    return totalDelay
                }
            }, 0)
        } else {
            return 0
        }
    })
}

// TODO: bar counts where a segment is not a full bar
export default function Ruler() {
    const [variation, dispatch] = useVariation()
    const segments = variation?.segments ?? []

    const loops = getLoops(segments)
    const segmentLengths = useSegmentLengths()
    const [highlightedLoop, setHighlightedLoop] = useState<Loop["id"] | null>(null)

    const TICKS_PER_BEAT = 48
    const BEATS_PER_BAR = 4 // TODO: read time signature from midi

    const elements = []
    let currentLoop: Loop | null = null
    let totalTime = 0
    for (let i = 0; i < segmentLengths.length; i++) {
        const segment = segments[i]
        let length = segmentLengths[i]

        if (length === 0) {
            // Loop or other, so check for loop handle
            for (const loop of loops) {
                if (i === loop.start) {
                    currentLoop = loop
                    elements.push(<LoopHandle key={`start_loop_${loop.id}`} segment={segment.id} kind="start" loop={loop} setHighlightedLoop={setHighlightedLoop} />)
                }
                if (i === loop.end) {
                    currentLoop = null
                    elements.push(<LoopHandle key={`end_loop_${loop.id}`} segment={segment.id} kind="end" loop={loop} setHighlightedLoop={setHighlightedLoop} />)
                }
                continue
            }
            continue
        }

        // Consume all segments that are part of this loop
        if (currentLoop !== null) {
            while (segments[i + 1].type !== "EndLoop") {
                length += segmentLengths[++i]
            }
        }

        elements.push(<div
            key={segment.id}
            className={classNames({
                [styles.rulerSegment]: true,
                [styles.highlighted]: currentLoop !== null && (currentLoop.id === highlightedLoop),
            })}
            style={ticksToStyle(length)}
            title={currentLoop === null ? "Double-click to loop" : "Double-click to remove loop"}
            onDoubleClick={() => {
                dispatch({
                    type: "toggle_segment_loop",
                    id: segment.id,
                })
            }}
        >
            {currentLoop && <div className={styles.loop}>
                {currentLoop.iterCount > 0 && <span className={styles.loopIterCount}>{`×${currentLoop.iterCount}`}</span>}
            </div>}
        </div>)
        totalTime += length
    }

    const bars = []
    for (let time = 0, bar = 0; time < totalTime; bar++, time += TICKS_PER_BEAT * BEATS_PER_BAR) {
        const remaining = Math.min(totalTime - time, TICKS_PER_BEAT * BEATS_PER_BAR)
        bars.push(<div key={bar} className={styles.bar} style={ticksToStyle(remaining)}>
            {bar}
        </div>)
    }

    return <div className={styles.ruler}>
        <div className={styles.loops}>
            {elements}
        </div>
        <div className={styles.bars}>
            {bars}
        </div>
    </div>
}
