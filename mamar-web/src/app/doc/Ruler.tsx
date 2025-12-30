import { Button, ButtonGroup, Content, Dialog, DialogTrigger, Divider, Form, Heading, NumberField, Switch } from "@adobe/react-spectrum"
import classNames from "classnames"
import { Event, Segment } from "pm64-typegen"
import { useState } from "react"
import { usePress } from "react-aria"

import Playhead from "./Playhead"
import styles from "./Ruler.module.scss"
import { useTime } from "./timectx"

import { useBgm, useSegment, useVariation } from "../store"
import { getSegmentId } from "../store/segment"

interface Loop {
    id: number
    start: number
    end: number
    iterCount: number
}

function getLoops(segments: Segment[]): Loop[] {
    const loops: Loop[] = []

    for (let startIdx = 0; startIdx < segments.length; startIdx++) {
        const start = segments[startIdx]
        if ("StartLoop" in start) {
            // Look for EndLoop
            for (let endIdx = 0; endIdx < segments.length; endIdx++) {
                const end = segments[endIdx]
                if ("EndLoop" in end && end.EndLoop.label_index === start.StartLoop.label_index) {
                    if (start.StartLoop.id == null) {
                        console.error("Segment", start, "does not have an ID")
                        continue
                    }

                    loops.push({
                        id: start.StartLoop.id,
                        start: startIdx,
                        end: endIdx,
                        iterCount: end.EndLoop.iter_count,
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
        if (bgm && "Subseg" in segment) {
            const master = bgm.track_lists[segment.Subseg.track_list].tracks[0]
            const commands = master.commands as unknown as Event[]

            return commands.reduce((totalDelay, event) => {
                if ("Delay" in event) {
                    return totalDelay + event.Delay
                } else {
                    return totalDelay
                }
            }, 0)
        } else {
            return 0
        }
    })
}

export default function Ruler() {
    const [variation] = useVariation()
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
        const id = getSegmentId(segment)
        if (id == null) {
            console.error("Segment", segment, "does not have an ID")
            continue
        }

        let length = segmentLengths[i]

        if (length === 0) {
            // Loop or other, so check for loop handle
            for (const loop of loops) {
                if (i === loop.start) {
                    currentLoop = loop
                    elements.push(<LoopHandle key={`start_loop_${loop.id}`} segment={id} kind="start" loop={loop} setHighlightedLoop={setHighlightedLoop} />)
                }
                if (i === loop.end) {
                    currentLoop = null
                    elements.push(<LoopHandle key={`end_loop_${loop.id}`} segment={id} kind="end" loop={loop} setHighlightedLoop={setHighlightedLoop} />)
                }
                continue
            }
            continue
        }

        if (currentLoop !== null) {
            // Consume all segments that are part of this loop
            while (!("EndLoop" in segments[i + 1])) {
                length += segmentLengths[++i]
            }

            const loop = Object.assign({}, currentLoop!) // Avoids stale currentLoop reference in dialog func below

            elements.push(<DialogTrigger key={id} >
                <RulerSegment segment={segment} currentLoop={currentLoop} highlightedLoop={highlightedLoop} length={length} />
                {close => <LoopDialog loop={loop} close={close} />}
            </DialogTrigger>)
        } else {
            elements.push(<RulerSegment key={id} segment={segment} currentLoop={currentLoop} highlightedLoop={highlightedLoop} length={length} />)
        }

        totalTime += length
    }

    const bars = []
    for (let time = 0, bar = 1; time < totalTime; bar++, time += TICKS_PER_BEAT * BEATS_PER_BAR) {
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
            <Playhead />
            {bars}
        </div>
    </div>
}

function RulerSegment({ segment, currentLoop, highlightedLoop, length, onPress }: {
    segment: Segment
    currentLoop: Loop | null
    highlightedLoop: number | null
    length: number
    onPress?: (e: unknown) => void
}) {
    const [, dispatch] = useVariation()
    const { pressProps } = usePress({ onPress })

    return <div
        {...pressProps}
        className={classNames({
            [styles.rulerSegment]: true,
            [styles.highlighted]: currentLoop !== null && (currentLoop.id === highlightedLoop),
        })}
        style={ticksToStyle(length)}
        title={currentLoop === null ? "Double-click to loop" : ""}
        onDoubleClick={() => {
            const id = getSegmentId(segment)
            if (id == null) {
                console.error("Segment", segment, "does not have an ID")
                return
            }

            dispatch({
                type: "toggle_segment_loop",
                id,
            })
        }}
    >
        {currentLoop && <div className={styles.loop}>
            {currentLoop.iterCount > 0 && <span className={styles.loopIterCount}>{`×${currentLoop.iterCount + 1}`}</span>}
        </div>}
    </div>
}

function LoopDialog({ loop, close }: { loop: Loop, close: () => void }) {
    const [variation, variationDispatch] = useVariation()

    const end = variation?.segments[loop.end]
    const id = (end && "EndLoop" in end) ? end.EndLoop.id : undefined
    console.assert(end && "EndLoop" in end, "Segment", end, "is not EndLoop")

    const [, endDispatch] = useSegment(id)

    function setIterCount(iterCount: number) {
        endDispatch({
            type: "set_loop_iter_count",
            iter_count: iterCount,
        })
    }

    function deleteLoop() {
        const start = variation?.segments[loop.start]
        if (start) {
            if (!("StartLoop" in start)) {
                console.error("Segment", start, "is not StartLoop")
                return
            }

            if (start.StartLoop.id == null) {
                console.error("Segment", start, "does not have an ID")
                return
            }

            variationDispatch({
                type: "toggle_segment_loop",
                id: start.StartLoop.id,
            })
        }
    }

    return <Dialog size="S">
        <Heading>
            Edit Loop
        </Heading>
        <Divider />
        <Content>
            <Form onSubmit={e => {
                e.preventDefault()
                close()
            }}>
                <Switch autoFocus isSelected={loop.iterCount === 0} onChange={infinite => setIterCount(infinite ? 0 : 1)}>
                    Repeat infinitely
                </Switch>
                <NumberField
                    label="Repetitions"
                    isDisabled={loop.iterCount === 0}
                    value={loop.iterCount + 1}
                    onChange={count => setIterCount(count - 1)}
                    minValue={2} maxValue={256}
                />
            </Form>
        </Content>
        <ButtonGroup>
            <Button variant="negative" onPress={deleteLoop}>
                Delete
            </Button>
            <Button variant="cta" onPress={close}>
                Close
            </Button>
        </ButtonGroup>
    </Dialog>
}
