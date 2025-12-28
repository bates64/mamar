import { View } from "@adobe/react-spectrum"
import classNames from "classnames"
import type { Event } from "pm64-typegen"
import { useId, useDeferredValue, useRef, memo, startTransition } from "react"

import Ruler, { ticksToStyle, useSegmentLengths } from "./Ruler"
import styles from "./SegmentMap.module.scss"
import { TimeProvider } from "./timectx"

import TrackControls from "../emu/TrackControls"
import { useBgm, useDoc, useVariation } from "../store"
import useSelection, { SelectionProvider } from "../util/hooks/useSelection"

const TRACK_HEAD_WIDTH = 100 // Match with $trackHead-width

function PianoRollThumbnail({ trackIndex, trackListIndex }: { trackIndex: number, trackListIndex: number }) {
    const [doc, dispatch] = useDoc()
    const [bgm] = useBgm()
    const track = bgm?.trackLists[trackListIndex]?.tracks[trackIndex]
    const isSelected = doc?.panelContent.type === "tracker" && doc?.panelContent.trackList === trackListIndex && doc?.panelContent.track === trackIndex
    const nameId = useId()
    const commands = useDeferredValue(track?.commands.vec || [])

    if (!track || track.commands.vec.length === 0) {
        return <></>
    } else {
        const handlePress = (evt: any) => {
            startTransition(() => {
                dispatch({
                    type: "set_panel_content",
                    panelContent: isSelected ? { type: "not_open" } : {
                        type: "tracker",
                        trackList: trackListIndex,
                        track: trackIndex,
                    },
                })
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
            <Thumbnail commands={commands} />
            <div id={nameId} className={styles.segmentName}>{track.name}</div>
        </div>
    }
}

function TrackName({ index }: { index: number }) {
    return <div className={styles.trackName}>
        {index === 0 ? "Master" : `Track ${index}`}
    </div>
}

const Thumbnail = memo(({ commands }: { commands: Event[] }) => {
    // Preferred musical range so segments can be compared by their pitch range
    const c2 = 107 + 36
    const c5 = 107 + 72

    // Determine pitch range
    let minPitch = 256
    let maxPitch = 0
    let hasNoteInRange = false
    for (const command of commands) {
        if (command.type === "Note") {
            minPitch = Math.min(minPitch, command.pitch)
            maxPitch = Math.max(maxPitch, command.pitch)

            if (command.pitch >= c2 && command.pitch <= c5) {
                hasNoteInRange = true
            }
        }
    }

    // Prefer C2-C5 range, but if there are no notes there, center on where the notes are
    if (hasNoteInRange) {
        minPitch = c2
        maxPitch = c5
    } else {
        const middle = Math.floor((minPitch + maxPitch) / 2)
        const size = c5 - c2 + 1
        minPitch = middle - Math.floor(size / 2)
        maxPitch = middle + Math.floor(size / 2)
    }

    // Render each note as an svg <rect>
    const notes = []
    let time = 0
    for (const command of commands) {
        if (command.type === "Note") {
            notes.push(<rect
                key={command.id}
                x={time}
                y={command.pitch - minPitch}
                width={command.length}
                height={1}
            />)
        } else if (command.type === "Delay") {
            time += command.value
        }
    }

    // Display the whole used range
    const height = maxPitch - minPitch + 1
    const viewBox = `0 0 ${time} ${height}`

    return <svg viewBox={viewBox} preserveAspectRatio="none">
        <g transform={`translate(0, ${height}) scale(1,-1)`}>
            {notes}
        </g>
    </svg>
})

function Container() {
    const [variation] = useVariation()
    const selection = useSelection()
    const segmentLengths = useSegmentLengths()
    const container = useRef<HTMLDivElement | null>(null)

    const tracks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] // TODO: don't show track 0
    const totalLength = segmentLengths.reduce((acc, len) => acc + len, 0)

    return <TimeProvider value={{
        xToTicks(clientX: number): number {
            if (!container.current) return NaN
            const px = clientX - container.current.getBoundingClientRect().left
            const style = getComputedStyle(container.current)
            const rulerZoom = parseFloat(style.getPropertyValue("--ruler-zoom"))

            const ticks = (px - TRACK_HEAD_WIDTH) * rulerZoom
            if (ticks < 0) return 0
            if (ticks > totalLength) return totalLength
            return ticks
        },

        ticksToXOffset(ticks: number): number {
            if (!container.current) return NaN
            const style = getComputedStyle(container.current)
            const rulerZoom = parseFloat(style.getPropertyValue("--ruler-zoom"))
            return ticks / rulerZoom
        },
    }}>
        <div
            ref={container}
            aria-label="Segments"
            className={styles.table}
            onClick={() => {
                selection.clear()
            }}
        >
            {variation && <div>
                <Ruler />
                {tracks.map(i => <div key={i} className={styles.track} aria-label={`Track ${i}`}>
                    {<div className={styles.trackHead}>
                        <TrackName index={i} />
                        {i > 0 && <TrackControls trackIndex={i} />}
                    </div>}
                    {variation.segments.map((segment, segmentIndex) => {
                        if (segment.type === "Subseg") {
                            return <View
                                key={segment.id}
                                colorVersion={6}
                                UNSAFE_style={ticksToStyle(segmentLengths[segmentIndex])}
                            >
                                <PianoRollThumbnail trackIndex={i} trackListIndex={segment.trackList} />
                            </View>
                        } else {
                            return <div key={segment.id} />
                        }
                    })}
                </div>)}
            </div>}
        </div>
    </TimeProvider>
}

export default function SegmentMap() {
    return <SelectionProvider>
        <Container />
    </SelectionProvider>
}
