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
    let time = 0
    let currentLoop: Loop | null = null
    for (let i = 0; i < segmentLengths.length; i++) {
        const segment = segments[i]
        const length = segmentLengths[i]

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

        const barLength = length / (TICKS_PER_BEAT * BEATS_PER_BAR)
        const bars = []
        for (let i = 0; i < barLength; i++) {
            const bar = Math.floor(time / (TICKS_PER_BEAT * BEATS_PER_BAR)) + i
            bars.push(<div key={`bar_${i}`} className={styles.bar} style={ticksToStyle(TICKS_PER_BEAT * BEATS_PER_BAR)}>
                {bar}
            </div>)
        }

        elements.push(<div
            key={segment.id}
            className={classNames({
                [styles.rulerSegment]: true,
                [styles.loop]: currentLoop !== null,
                [styles.highlighted]: currentLoop !== null && (currentLoop.id === highlightedLoop),
            })}
            style={ticksToStyle(length)}
            onDoubleClick={() => {
                dispatch({
                    type: "toggle_segment_loop",
                    id: segment.id,
                })
            }}
        >
            {bars}
        </div>)

        time += length
    }

    return <div className={styles.ruler}>
        {elements}
    </div>
}
