import classNames from "classnames"
import { Segment } from "pm64-typegen"
import { useId } from "react"

import styles from "./SegmentMap.module.scss"

import TrackControls from "../emu/TrackControls"
import { useBgm, useDoc, useVariation } from "../store"
import useSelection, { SelectionProvider } from "../util/hooks/useSelection"

interface Loop {
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

function PianoRollThumbnail({ trackIndex, trackListIndex }: { trackIndex: number, trackListIndex: number }) {
    const [doc, dispatch] = useDoc()
    const [bgm] = useBgm()
    const track = bgm?.trackLists[trackListIndex]?.tracks[trackIndex]
    const isSelected = doc?.panelContent.type === "tracker" && doc?.panelContent.trackList === trackListIndex && doc?.panelContent.track === trackIndex
    const nameId = useId()

    if (!track || track.commands.vec.length === 0) {
        return <></>
    } else {
        const handlePress = (evt: any) => {
            dispatch({
                type: "set_panel_content",
                panelContent: isSelected ? { type: "not_open" } : {
                    type: "tracker",
                    trackList: trackListIndex,
                    track: trackIndex,
                },
            })
            evt.stopPropagation()
            evt.preventDefault()
        }

        return <div
            tabIndex={0}
            aria-labelledby={nameId}
            className={classNames({
                [styles.pianoRollThumbnail]: true,
                [styles.drumRegion]: track.isDrumTrack,
                [styles.disabledRegion]: track.isDisabled,
                [styles.hasInterestingParentTrack]: track.parentTrackIdx !== 0,
                [styles.selected]: isSelected,
            })}
            onClick={handlePress}
            onKeyDown={evt => {
                if (evt.key === "Enter" || evt.key === " ") {
                    handlePress(evt)
                }
            }}
        >
            <div id={nameId} className={styles.segmentName}>Region {trackListIndex}.{trackIndex}</div>
        </div>
    }
}

function ticksToStyle(ticks: number) {
    // TODO: zoom via a css variable
    return {
        width: `calc(${ticks}px / var(--ruler-zoom))`,
    }
}

function LoopHandle() {
    // TODO
    return <div>
    </div>
}

// TODO: bar counts where a segment is not a full bar
function Ruler({ segmentLengths, loops }: { segmentLengths: number[], loops: Loop[] }) {
    const TICKS_PER_BEAT = 48
    const BEATS_PER_BAR = 4 // TODO: read time signature from midi

    const segments = []
    let time = 0
    let inLoop = false
    for (let segment = 0; segment < segmentLengths.length; segment++) {
        const length = segmentLengths[segment]

        if (length === 0) {
            // Loop or other, so check for loop handle
            for (const { start, end } of loops) {
                if (segment === start) {
                    inLoop = true
                    segments.push(<LoopHandle />)
                }
                if (segment === end) {
                    inLoop = false
                    segments.push(<LoopHandle />)
                }
                continue
            }
            continue
        }

        const barLength = length / (TICKS_PER_BEAT * BEATS_PER_BAR)
        const bars = []
        for (let i = 0; i < barLength; i++) {
            const bar = Math.floor(time / (TICKS_PER_BEAT * BEATS_PER_BAR)) + i
            bars.push(<div className={styles.bar} style={ticksToStyle(TICKS_PER_BEAT * BEATS_PER_BAR)}>
                {bar}
            </div>)
        }

        segments.push(<div
            className={classNames({
                [styles.rulerSegment]: true,
                [styles.loop]: inLoop,
            })}
            style={ticksToStyle(length)}
        >
            {bars}
        </div>)

        time += length
    }

    return <div className={styles.ruler}>
        {segments}
    </div>
}

function Container() {
    const [variation] = useVariation()
    const selection = useSelection()

    const tracks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
    const segments = variation?.segments ?? []
    const loops = getLoops(segments)

    const [bgm] = useBgm()
    const segmentLengths = segments.map(segment => {
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

    return <div
        aria-label="Segments"
        className={styles.table}
        onClick={() => {
            selection.clear()
        }}
    >
        {variation && <div>
            <Ruler segmentLengths={segmentLengths} loops={loops} />
            {tracks.map(i => <tr key={i} className={styles.track} aria-label={`Track ${i+1}`}>
                {<div className={styles.trackHead}>
                    <div className={styles.trackName}>Track {i + 1}</div>
                    <TrackControls trackIndex={i} />
                </div>}
                {variation.segments.map((segment, segmentIndex) => {
                    if (segment.type === "Subseg") {
                        return <div
                            key={segment.id}
                            style={ticksToStyle(segmentLengths[segmentIndex])}
                        >
                            <PianoRollThumbnail trackIndex={i} trackListIndex={segment.trackList} />
                        </div>
                    } else {
                        return <div key={segment.id} />
                    }
                })}
            </tr>)}
        </div>}
    </div>

}

export default function SegmentMap() {
    return <SelectionProvider>
        <Container />
    </SelectionProvider>
}
