import classNames from "classnames"
import { Segment } from "pm64-typegen"
import { useId } from "react"

import styles from "./SegmentMap.module.scss"

import TrackControls from "../emu/TrackControls"
import { useBgm, useDoc, useVariation } from "../store"
import { variationReducer } from "../store/variation"
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

function useAddNewSegment() {
    const [variation, dispatch] = useVariation()
    return () => dispatch({ type: "add_segment", id: variation?.segments.length ?? 1, trackList: variation?.segments.length ?? 1 }) // new action
}

function useAddLoopStart() {
    const [variation, dispatch] = useVariation()
    return () => dispatch({ type: "add_loop_start", id: variation?.segments.length ?? 1, iterCount: 0 }) // new action
}

function Container() {
    const [variation] = useVariation()
    const selection = useSelection()

    const tracks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
    const loops = getLoops(variation?.segments ?? [])

    return <table
        aria-label="Segments"
        className={styles.table}
        onClick={() => {
            selection.clear()
        }}
    >
        {variation && <tbody>
            {loops.map(({ start, end }) => {
                const endSeg = variation.segments[end]

                if (endSeg.type !== "EndLoop")
                    throw new Error("Expected EndLoop")

                return <tr aria-label={`Loop ${endSeg.label_index} gutter`}>
                    <td colSpan={start + 1} />
                    <td colSpan={end - start + 1} className={styles.loop}>
                        Loop {endSeg.iter_count !== 0 && `${endSeg.iter_count}x`}
                    </td>
                </tr>
            })}
            {tracks.map(i => <tr key={i} className={styles.track} aria-label={`Track ${i+1}`}>
                <td className={styles.trackHead}>
                    <div className={styles.trackName}>Track {i + 1}</div>
                    <TrackControls trackIndex={i} />
                </td>
                {variation.segments.map(segment => {
                    if (segment.type === "Subseg") {
                        return <td
                            key={segment.id}
                        >
                            <PianoRollThumbnail trackIndex={i} trackListIndex={segment.trackList} />
                        </td>
                    } else {
                        return <td key={segment.id} />
                    }
                })}
            </tr>)}

        </tbody>}
    </table>

}

export default function SegmentMap() {
    const addLoopStart = useAddLoopStart()
    const addNewSegment = useAddNewSegment()
    return <SelectionProvider>
        <Container />
        <button onClick={addLoopStart}>Add loop start</button>
        <button onClick={addNewSegment}>Add new region</button>
    </SelectionProvider>
}
