import { Button, ButtonGroup, Content, Dialog, DialogTrigger, Divider, Form, Heading, NumberField, Switch } from "@adobe/react-spectrum"
import classNames from "classnames"
import { Segment } from "pm64-typegen"
import { useState } from "react"
import { usePress } from "react-aria"

import Playhead from "./Playhead"
import styles from "./Ruler.module.scss"
import { useTime } from "./timectx"

import { useBgm, useSegment, useVariation } from "../store"

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
            return master.commands.reduce((totalDelay, event) => {
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

        if (currentLoop !== null) {
            // Consume all segments that are part of this loop
            while (segments[i + 1].type !== "EndLoop") {
                length += segmentLengths[++i]
            }

            const loop = Object.assign({}, currentLoop!) // Avoids stale currentLoop reference in dialog func below

            elements.push(<DialogTrigger key={segment.id} >
                <RulerSegment segment={segment} currentLoop={currentLoop} highlightedLoop={highlightedLoop} length={length} />
                {close => <LoopDialog loop={loop} close={close} />}
            </DialogTrigger>)
        } else {
            elements.push(<RulerSegment key={segment.id} segment={segment} currentLoop={currentLoop} highlightedLoop={highlightedLoop} length={length} />)
        }

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
            dispatch({
                type: "toggle_segment_loop",
                id: segment.id,
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
    const [, endDispatch] = useSegment(variation?.segments[loop.end].id)

    function setIterCount(iterCount: number) {
        endDispatch({
            type: "set_loop_iter_count",
            iter_count: iterCount,
        })
    }

    function deleteLoop() {
        const start = variation?.segments[loop.start]
        if (start)
            variationDispatch({
                type: "toggle_segment_loop",
                id: start.id,
            })
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
