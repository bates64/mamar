import Refresh from "@spectrum-icons/workflow/Refresh"
import * as pm64 from "pm64-typegen"
import { useRef, useEffect, useState, CSSProperties, useId, KeyboardEvent, useCallback } from "react"

import styles from "./VariationsMap.module.scss"

import { useBgm, useDoc, useSegment, useVariation } from "../store"
import useSelection, { SelectionProvider } from "../util/hooks/useSelection"

const SEGMENT_WIDTH_PX = 180
const LOOP_HEIGHT_PX = 24

// TODO: pass variationIndex around with context via state.ts

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

function alignXPos(x: number) {
    return Math.round(x / SEGMENT_WIDTH_PX) * SEGMENT_WIDTH_PX
}

function LoopDragColumn({ x, otherX, variationIndex, segmentId }: {
    x: number
    otherX: number
    variationIndex: number
    segmentId: number
}) {
    const [segment] = useSegment(segmentId, variationIndex)
    const [variation, dispatch] = useVariation(variationIndex)

    if (segment?.type !== "StartLoop" && segment?.type !== "EndLoop") {
        throw new Error("Invalid segment type for DraggableLoopColumn")
    }

    if (!variation) {
        throw new Error("Variation not found")
    }

    const [dragging, setDragging] = useState(false)
    const [dragX, setDragX] = useState(0)
    const ref = useRef<HTMLDivElement>(null)

    const commitDataRef = useRef<{ toIndex: number, segmentId: number }>({ toIndex: 0, segmentId: 0 })
    commitDataRef.current.segmentId = segmentId
    const commit = useCallback(() => {
        dispatch({
            type: "move_segment",
            id: commitDataRef.current.segmentId,
            toIndex: commitDataRef.current.toIndex,
        })
    }, [dispatch, commitDataRef])

    const xRef = useRef(x)
    xRef.current = x
    useEffect(() => {
        if (dragging) {
            setDragX(xRef.current)

            const mouseMove = (evt: MouseEvent) => {
                setDragX(dragX => dragX + evt.movementX)
            }

            const mouseUp = () => {
                commit()
                setDragging(false)
            }

            document.addEventListener("mousemove", mouseMove)
            document.addEventListener("mouseup", mouseUp)

            return () => {
                document.removeEventListener("mousemove", mouseMove)
                document.removeEventListener("mouseup", mouseUp)
            }
        }
    }, [commit, dragging, xRef])

    const maxX = getXPosOfSegment(variation.segments[variation.segments.length - 1], variation.segments) + SEGMENT_WIDTH_PX
    const minX = getXPosOfSegment(variation.segments[0], variation.segments)
    const x2 = alignXPos(Math.min(Math.max(minX, dragX), maxX))

    commitDataRef.current.toIndex = Math.round(x2 / SEGMENT_WIDTH_PX)

    const label = (segment.type === "StartLoop" ? "Start" : "End")
        + " of Loop " + segment.label_index

    return <>
        <div
            ref={ref}
            aria-label={label}
            tabIndex={0}
            className={styles.loopDragColumn}
            style={{
                left: `${x}px`,
            }}
            onFocus={() => setDragging(true)}
            onBlur={() => {
                commit()
                setDragging(false)
            }}
            onMouseDown={() => setDragging(true)}
            onKeyDown={(evt: KeyboardEvent) => {
                if (evt.key === "Left") {
                    setDragX(dragX => dragX - SEGMENT_WIDTH_PX)
                } else if (evt.key === "Right") {
                    setDragX(dragX => dragX + SEGMENT_WIDTH_PX)
                }
            }}
        />
        {dragging && <LoopOverlayGhost x1={otherX} x2={x2} labelIndex={segment.label_index} />}
    </>
}

// TODO: don't use this, set state so the real overlay applies the positions & .dragging
function LoopOverlayGhost({ x1, x2, labelIndex }: {
    x1: number
    x2: number
    labelIndex: number
}) {
    const x = Math.min(x1, x2)
    const width = Math.abs(x2 - x1)

    if (width === 0) {
        return <></>
    }

    const middle = width / 2
    const spaceForLabel = 12

    return <div
        aria-hidden={true}
        className={styles.loop}
        style={{
            top: (LOOP_HEIGHT_PX * labelIndex) + "px",
            left: x + "px",
            width: width + "px",
        }}
    >
        <div className={`${styles.loopIterCount} ${styles.dragging}`}>
            <Refresh />
        </div>
        <svg className={styles.loopSvg}>
            <line x1={0} y1={LOOP_HEIGHT_PX / 2} x2={middle - spaceForLabel} y2={LOOP_HEIGHT_PX / 2} />
            <line x1={middle + spaceForLabel} y1={LOOP_HEIGHT_PX / 2} x2={width} y2={LOOP_HEIGHT_PX / 2} />

            <line x1={0} y1={LOOP_HEIGHT_PX / 2} x2={0} y2={LOOP_HEIGHT_PX} />
            <line x1={width} y1={LOOP_HEIGHT_PX / 2} x2={width} y2={LOOP_HEIGHT_PX} />
        </svg>
    </div>
}

function LoopOverlay({ variationIndex, startLoopId, endLoopId, x, width }: {
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

    return <div
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
                aria-label={`Loop ${startLoop.label_index} iteration count (${iterCount === 0 ? "infinite" : iterCount})`}
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
    </div>
}

function Segment({ segmentId, variationIndex }: {
    segmentId: number
    variationIndex: number
}) {
    const selection = useSelection()
    const [, dispatch] = useDoc()
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

            return <>
                <LoopDragColumn
                    x={startLoopX}
                    otherX={endLoopX}
                    variationIndex={variationIndex}
                    segmentId={segment.id}
                />
                <LoopOverlay
                    variationIndex={variationIndex}
                    startLoopId={segment.id}
                    endLoopId={endLoop.id}
                    x={startLoopX}
                    width={width}
                />
            </>
        } else {
            label = "Orphaned StartLoop"
            classNames.push(styles.red)
        }
    } else if (segment.type === "EndLoop") {
        // Find StartLoop
        const startLoop = segments.find(s => s.type === "EndLoop" && s.label_index === segment.label_index)

        if (startLoop) {
            const startLoopX = getXPosOfSegment(startLoop, segments)
            const endLoopX = getXPosOfSegment(segment, segments)

            return <LoopDragColumn
                x={endLoopX}
                otherX={startLoopX}
                variationIndex={variationIndex}
                segmentId={segment.id}
            />
        } else {
            label = "Orphaned EndLoop"
            classNames.push(styles.red)
        }
    }

    if (segment.type === "Subseg") {
        const trackList = bgm.trackLists[segment.trackList]
        label = trackList.pos ? `Tracks 0x${trackList.pos.toString(16)}` : `Tracks ${segment.id}`
        classNames.push(styles.blue)
    }

    const isSelected = selection.isSelected(segment.id)
    if (isSelected) {
        classNames.push(styles.selected)
    }

    return <div
        role="gridcell"
        tabIndex={0}
        className={classNames.join(" ")}
        aria-selected={isSelected}
        onClick={evt => {
            if (evt.shiftKey) {
                selection.multiSelect(segment.id)
            } else {
                selection.select(segment.id)
            }
            evt.stopPropagation()
        }}
        onDoubleClick={evt => {
            if (segment.type === "Subseg") {
                dispatch({
                    type: "open_track_list",
                    trackListId: segment.trackList,
                })
                evt.stopPropagation()
                evt.preventDefault()
            }
        }}
    >
        <div className={styles.segmentName}>
            {label}
        </div>
    </div>
}

function Variation({ index }: {
    index: number
}) {
    const id = useId()
    const [bgm] = useBgm()
    const segments = bgm?.variations[index]?.segments ?? []
    const loopCount = segments.filter(s => s.type === "EndLoop").length

    return <div className={styles.variation}>
        <div className={styles.variationName} id={id}>
            Variation {index}
        </div>

        <div className={styles.segmentsListContainer}>
            <div
                role="row"
                tabIndex={0}
                aria-labelledby={id}
                className={styles.segmentsList}
                style={{ paddingTop: (loopCount * LOOP_HEIGHT_PX) + "px" }}
            >
                {segments.map(segment => <Segment
                    key={segment.id}
                    variationIndex={index}
                    segmentId={segment.id}
                />)}
            </div>
        </div>
    </div>
}

function VariationsMapInner() {
    const [bgm] = useBgm()
    const selection = useSelection()

    return <div
        role="grid"
        aria-label="Variation map"
        className={styles.container}
        style={{ "--segment-width": `${SEGMENT_WIDTH_PX}px` } as CSSProperties}
        onClick={() => {
            selection.clear()
        }}
    >
        {bgm?.variations.map((_, i) => <Variation
            key={i}
            index={i}
        />)}
    </div>
}

export default function VariationsMap() {
    return <SelectionProvider>
        <VariationsMapInner />
    </SelectionProvider>
}
