import Refresh from "@spectrum-icons/workflow/Refresh"
import * as pm64 from "pm64-typegen"
import { useRef, useEffect, useState } from "react"

import styles from "./SegmentsMap.module.scss"

import { useBgm, useSegment } from "../store"

const SEGMENT_WIDTH_PX = 180
const LOOP_HEIGHT_PX = 24

function getXPosOfSegment(segment: pm64.Segment, segments: pm64.Segment[]) {
    let x = 0

    for (const s of segments) {
        if (s.id === segment.id) {
            break
        }

        if (s.type !== "StartLoop" && s.type !== "EndLoop") {
            x += SEGMENT_WIDTH_PX
        }
    }

    return x
}

function Loop({ variationIndex, startLoopId, endLoopId, x, width }: {
    variationIndex: number
    startLoopId: number
    endLoopId: number
    x: number
    width: number
}) {
    const [startLoop] = useSegment(startLoopId, variationIndex)
    const [endLoop, dispatch] = useSegment(endLoopId, variationIndex)
    const iterCount = endLoop?.type === "EndLoop" ? endLoop.iter_count : 0
    const [iterCountStr, setIterCountStr] = useState("")
    const inputRef = useRef<HTMLInputElement>(null)
    const [focus, setFocus] = useState(false)
    const [modified, setModified] = useState(false)

    const isInfinite = iterCountStr === "0" || iterCountStr === ""

    // Update iterCountStr when prop changes
    useEffect(() => {
        setIterCountStr(iterCount === 0 ? "" : iterCount.toString())
    }, [iterCount])

    // Grow to match its contents
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.value = iterCountStr
            inputRef.current.style.width = `${inputRef.current.value.length}ch`
        }
    }, [inputRef, iterCountStr])

    if (startLoop?.type !== "StartLoop" || endLoop?.type !== "EndLoop") {
        throw new Error("Loop start and end segments must be StartLoop and EndLoop")
    }

    const middle = width / 2
    const spaceForLabel = focus ? 40 : 12 + iterCountStr.length * 6

    return <li
        tabIndex={0}
        aria-label={`Loop ${startLoop.label_index}`}
        className={styles.loop}
        style={{
            top: (LOOP_HEIGHT_PX * startLoop.label_index) + "px",
            left: x + "px",
            width: width + "px",
        }}
    >
        <div
            className={styles.loopIterCount}
            onClick={() => {
                inputRef.current?.focus()
            }}
        >
            <Refresh />
            <input
                ref={inputRef}
                type="number"
                title="Iteration count (0 = infinite)"
                className={isInfinite ? styles.loopIterInfiniteInput : ""}
                value={iterCountStr}
                step={1}
                max={255}
                min={0}
                placeholder="Iterations"
                onFocus={() => {
                    setIterCountStr("")
                    setFocus(true)
                }}
                onChange={evt => {
                    let normalised = evt.target.value
                        .trim()
                        .replace(/^0+/, "0")

                    if (parseInt(normalised) > 255) {
                        normalised = "255"
                    } else if (parseInt(normalised) <= 0) {
                        normalised = ""
                    } else if (normalised === "-") {
                        normalised = ""
                    }

                    setIterCountStr(normalised)
                    setModified(true)
                }}
                onBlur={evt => {
                    if (modified) {
                        let value = parseInt(evt.target.value)

                        if (isNaN(value)) {
                            value = 0
                        } else if (value > 255) {
                            value = 255
                        } else if (value < 0) {
                            value = 0
                        }

                        dispatch({
                            type: "set_loop_iter_count",
                            iter_count: value,
                        })
                        setModified(false)
                    } else {
                        setIterCountStr(iterCount === 0 ? "" : iterCount.toString())
                    }

                    setFocus(false)
                }}
            />
        </div>
        <svg className={styles.loopSvg}>
            <line x1={0} y1={LOOP_HEIGHT_PX / 2} x2={middle - spaceForLabel} y2={LOOP_HEIGHT_PX / 2} />
            <line x1={middle + spaceForLabel} y1={LOOP_HEIGHT_PX / 2} x2={width} y2={LOOP_HEIGHT_PX / 2} />

            <line x1={0} y1={LOOP_HEIGHT_PX / 2} x2={0} y2={LOOP_HEIGHT_PX} />
            <line x1={width} y1={LOOP_HEIGHT_PX / 2} x2={width} y2={LOOP_HEIGHT_PX} />
        </svg>
    </li>
}

function Segment({ segmentId, variationIndex }: {
    segmentId: number
    variationIndex: number
}) {
    const [bgm] = useBgm()
    const segments = bgm?.variations[variationIndex]?.segments
    const segment = segments?.find?.(s => s.id === segmentId)

    if (!bgm || !segments || !segment) {
        throw new Error(`no segment ${segmentId} in variation ${variationIndex}`)
    }

    let label: string = segment.type
    const classNames = [styles.segment]

    if (segment.type === "StartLoop") {
        // Find EndLoop
        const endLoopIndex = segments.findIndex(s => s.type === "EndLoop" && s.label_index === segment.label_index)
        const endLoop = segments[endLoopIndex]

        if (endLoop?.type === "EndLoop") {
            const startLoopX = getXPosOfSegment(segment, segments)
            const endLoopX = getXPosOfSegment(endLoop, segments)
            const width = endLoopX - startLoopX

            return <Loop
                variationIndex={variationIndex}
                startLoopId={segment.id}
                endLoopId={endLoop.id}
                x={startLoopX}
                width={width}
            />
        } else {
            label = "Orphaned StartLoop"
            classNames.push(styles.invalidLoopSegment)
        }
    } else if (segment.type === "EndLoop") {
        // Find StartLoop
        const startLoop = segments.find(s => s.type === "EndLoop" && s.label_index === segment.label_index)

        if (startLoop) {
            return <li
                tabIndex={0}
                aria-label={`End loop ${segment.label_index}`}
            />
        } else {
            label = "Orphaned EndLoop"
            classNames.push(styles.invalidLoopSegment)
        }
    }

    if (segment.type === "Subseg") {
        const trackList = bgm.trackLists[segment.trackList]
        label = trackList.pos ? `Tracks 0x${trackList.pos.toString(16)}` : `Tracks ${segment.id}`
    }

    return <li tabIndex={0} className={classNames.join(" ")}>
        <div tabIndex={0} className={styles.segmentName}>
            {label}
        </div>
    </li>
}

export function Variation({ index }: {
    index: number
}) {
    const [bgm] = useBgm()
    const segments = bgm?.variations[index]?.segments ?? []
    const loopCount = segments.filter(s => s.type === "EndLoop").length

    return <li className={styles.variation}>
        <div className={styles.variationName}>
            Variation {index}
        </div>

        <div className={styles.segmentsListContainer}>
            <ol
                tabIndex={0}
                aria-label="Segments"
                className={styles.segmentsList}
                style={{ paddingTop: (loopCount * LOOP_HEIGHT_PX) + "px" }}
            >
                {segments.map(segment => <Segment
                    key={segment.id}
                    variationIndex={index}
                    segmentId={segment.id}
                />)}
            </ol>
        </div>
    </li>
}

export default function VariationsMap() {
    const [bgm] = useBgm()

    return <ol className={styles.container}>
        {bgm?.variations.map((_, i) => <Variation key={i} index={i} />)}
    </ol>
}
