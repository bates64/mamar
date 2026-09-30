import { Button, ButtonGroup, Content, Dialog, DialogTrigger, Divider, Form, Heading, NumberField, Switch } from "@adobe/react-spectrum"
import classNames from "classnames"
import { Bgm, Branch, Event, Segment, TrackList } from "pm64-typegen"
import { useContext, useState } from "react"
import { usePress } from "react-aria"
import { getUntrackedObject } from "react-tracked"

import CycleStrip, { CycleShade, useCycleDrag } from "./CycleRegion"
import Playhead, { CONTEXT as PLAYHEAD_CONTEXT, snapToBeat } from "./Playhead"
import styles from "./Ruler.module.scss"
import TimeGrid from "./TimeGrid"
import { useTime } from "./TimeProvider"

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

/** @deprecated Use `TimeGrid` instead */
export function ticksToStyle(ticks: number) {
    return {
        width: `calc(${ticks}px / var(--ruler-zoom))`,
    }
}

export const TICKS_PER_BEAT = 48
export const DEFAULT_BEATS_PER_BAR = 4

export function useTicksPerBar(): number {
    const [bgm] = useBgm()
    return TICKS_PER_BEAT * (bgm?.beats_per_bar ?? DEFAULT_BEATS_PER_BAR)
}

/**
 * Ticks before bar 1. A variation whose first segment is shorter than a bar starts with it as a pickup, so its bars
 * line up with what follows.
 */
export function usePickup(): number {
    const ticksPerBar = useTicksPerBar()
    const first = useSegmentLengths().find(length => length > 0) ?? 0
    return first < ticksPerBar ? first : 0
}

// TODO: cache this better
/** Lengths of track lists already measured, as measuring one reads every command in it. */
const trackListLengths = new WeakMap<TrackList, { branches: Bgm["branches"], length: number }>()

function cachedTrackListLength(tracked: TrackList, trackedBranches: Bgm["branches"]): number {
    // Reading the objects under react-tracked's proxies is faster, and the caller already depends on each as a whole
    const trackList = getUntrackedObject(tracked) ?? tracked
    const branches = getUntrackedObject(trackedBranches) ?? trackedBranches
    const cached = trackListLengths.get(trackList)
    if (cached?.branches === branches) {
        return cached.length
    }
    const length = trackListLength(trackList, branches)
    trackListLengths.set(trackList, { branches, length })
    return length
}

export function useSegmentLengths(): number[] {
    const [bgm] = useBgm()
    const [variation] = useVariation()
    const segments = variation?.segments ?? []

    return segments.map(segment => {
        if (bgm && "Subseg" in segment) {
            return cachedTrackListLength(bgm.track_lists[segment.Subseg.track_list], bgm.branches)
        } else {
            return 0
        }
    })
}

/**
 * The game ends a segment when any enabled track reaches an End. Tracks without one play into whatever follows them,
 * so the master track's length stands in when no track has one. See TrackList::len_time in pm64.
 */
export function trackListLength(trackList: TrackList, branches: Bgm["branches"]): number {
    let length: number | undefined
    for (const track of trackList.tracks) {
        if (track.is_disabled) {
            continue
        }
        const end = endTime(track.commands as unknown as Event[], branches)
        if (end !== undefined && (length === undefined || end < length)) {
            length = end
        }
    }
    return length ?? sumDelays(trackList.tracks[0].commands as unknown as Event[])
}

/**
 * How long the commands play before their first End, including the time their detours and branches play, or undefined
 * if they have no End. See CommandSeq::end_time.
 */
function endTime(commands: Event[], branches: Bgm["branches"]): number | undefined {
    const markerTimes = new Map<string, number>()
    let linearTime = 0
    for (const event of commands) {
        if ("Delay" in event) {
            linearTime += event.Delay
        } else if ("Marker" in event && !markerTimes.has(event.Marker.label)) {
            markerTimes.set(event.Marker.label, linearTime)
        }
    }

    let time = 0
    for (const event of commands) {
        if ("End" in event) {
            return time
        } else if ("Branch" in event) {
            const branch = branches[event.Branch.branch]
            time += branch ? branchLength(branch) : 0
        } else if ("Delay" in event) {
            time += event.Delay
        } else if ("Detour" in event) {
            const start = markerTimes.get(event.Detour.start_label)
            const end = markerTimes.get(event.Detour.end_label)
            if (start !== undefined && end !== undefined) {
                time += Math.max(0, end - start)
            }
        }
    }
}

/** How long the first option plays. See Branch::len_time. */
function branchLength(branch: Branch): number {
    const first = branch.options[0]
    return first ? sumDelays(first.commands as unknown as Event[]) : 0
}

function sumDelays(commands: Event[]): number {
    let time = 0
    for (const event of commands) {
        if ("Delay" in event) {
            time += event.Delay
        }
    }
    return time
}

export default function Ruler() {
    const [variation] = useVariation()
    const segments = variation?.segments ?? []

    const loops = getLoops(segments)
    const segmentLengths = useSegmentLengths()
    const [highlightedLoop, setHighlightedLoop] = useState<Loop["id"] | null>(null)

    const pickup = usePickup()
    const ticksPerBar = useTicksPerBar()
    const time = useTime()
    const playhead = useContext(PLAYHEAD_CONTEXT)!
    const cycleDrag = useCycleDrag()

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
            // TimeGrid requires exactly 1 element per segment
            let addedElements = 0

            // Loop or other, so check for loop handle
            for (const loop of loops) {
                if (i === loop.start) {
                    currentLoop = loop
                    elements.push(<LoopHandle key={`start_loop_${loop.id}`} segment={id} kind="start" loop={loop} setHighlightedLoop={setHighlightedLoop} />)
                    addedElements++
                }
                if (i === loop.end) {
                    currentLoop = null
                    elements.push(<LoopHandle key={`end_loop_${loop.id}`} segment={id} kind="end" loop={loop} setHighlightedLoop={setHighlightedLoop} />)
                    addedElements++
                }
            }

            if (addedElements === 0) {
                elements.push(<div key={id} />)
            } else if (addedElements > 1){
                console.error(`Segment ${id} has more than one loop handle`)
            }

            continue
        }

        if (currentLoop !== null) {
            // Consume all segments that are part of this loop
            let numSegmentsInLoop = 1
            while (!("EndLoop" in segments[i + 1])) {
                length += segmentLengths[++i]
                numSegmentsInLoop++
            }

            const loop = Object.assign({}, currentLoop!) // Avoids stale currentLoop reference in dialog func below

            elements.push(<DialogTrigger key={id} >
                <RulerSegment segment={segment} currentLoop={currentLoop} highlightedLoop={highlightedLoop} length={numSegmentsInLoop} />
                {close => <LoopDialog loop={loop} close={close} />}
            </DialogTrigger>)
        } else {
            elements.push(<RulerSegment key={id} segment={segment} currentLoop={currentLoop} highlightedLoop={highlightedLoop} length={1} />)
        }

        totalTime += length
    }

    const bars = []
    if (pickup > 0) {
        bars.push(<div key={0} className={styles.bar} style={ticksToStyle(pickup)} />)
    }
    for (let time = pickup, bar = 1; time < totalTime; bar++, time += ticksPerBar) {
        const remaining = Math.min(totalTime - time, ticksPerBar)
        bars.push(<div key={bar} className={styles.bar} style={ticksToStyle(remaining)}>
            {bar}
        </div>)
    }

    return <div className={styles.ruler}>
        {/* Dragging along the top of the ruler marks a cycle, as in Logic */}
        <TimeGrid className={styles.cycleArea} onMouseDown={cycleDrag.beginMark}>
            <CycleStrip drag={cycleDrag} />
        </TimeGrid>
        <TimeGrid className={styles.loops}>
            {elements}
        </TimeGrid>
        <TimeGrid
            className={styles.bars}
            style={{ "--beat-offset": `${pickup % TICKS_PER_BEAT}px` } as React.CSSProperties}
            dragToScroll={{ axis: "x", button: 0, thresholdPx: 4 }}
            onClick={event => {
                // Clicking the ruler moves where playback starts, like dragging the playhead
                const ticks = event.shiftKey ? time.xToTicks(event.clientX) : snapToBeat(time.xToTicks(event.clientX), pickup)
                playhead.setStart(ticks)
                if (playhead.playing) {
                    playhead.play(ticks)
                }
            }}
        >
            <CycleShade />
            <Playhead />
            {bars}
        </TimeGrid>
    </div>
}

function RulerSegment({ segment, currentLoop, highlightedLoop, length, onPress }: {
    segment: Segment
    currentLoop: Loop | null
    highlightedLoop: number | null
    length: number // num segments in this loop
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
        style={{ gridColumn: `span ${length}` }}
        title={currentLoop === null
            ? "Double-click to loop this part of the song"
            : `Loop in the song, which ${currentLoop.iterCount > 0 ? `plays this part ${currentLoop.iterCount + 1} times` : "repeats this part forever"} in the game. Click to change it.`}
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
