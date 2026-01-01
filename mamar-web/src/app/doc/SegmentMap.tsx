import { View } from "@adobe/react-spectrum"
import classNames from "classnames"
import type { Event } from "pm64-typegen"
import { Track } from "pm64-typegen"
import { useId, useDeferredValue, memo, startTransition } from "react"

import styles from "./SegmentMap.module.scss"
import TimeGrid from "./TimeGrid"

import TrackControls from "../emu/TrackControls"
import { useBgm, useDoc, useVariation } from "../store"
import { getSegmentId } from "../store/segment"
import useSelection, { SelectionProvider } from "../util/hooks/useSelection"

function hasParentTrack({ polyphony }: Track): boolean {
    return typeof polyphony === "object" && "Link" in polyphony
}

function PianoRollThumbnail({ trackIndex, trackListIndex, segmentIndex }: { trackIndex: number, trackListIndex: number, segmentIndex: number }) {
    const [doc, dispatch] = useDoc()
    const [bgm] = useBgm()
    const track = bgm?.track_lists[trackListIndex]?.tracks[trackIndex]
    const isSelected = doc?.panelContent.type === "tracker" && doc?.panelContent.trackList === trackListIndex && doc?.panelContent.track === trackIndex
    const nameId = useId()
    const commands = useDeferredValue(track?.commands)

    if (!track || track.commands.length === 0) {
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
                        segment: segmentIndex,
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
                [styles.drumRegion]: track.is_drum_track,
                [styles.disabledRegion]: track.is_disabled,
                [styles.hasInterestingParentTrack]: hasParentTrack(track),
                [styles.selected]: isSelected,
            })}
            onClick={handlePress}
            onKeyDown={evt => {
                if (evt.key === "Enter" || evt.key === " ") {
                    handlePress(evt)
                }
            }}
        >
            {commands && <Thumbnail commands={commands} />}
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
        if ("Note" in command) {
            minPitch = Math.min(minPitch, command.Note.pitch)
            maxPitch = Math.max(maxPitch, command.Note.pitch)

            if (command.Note.pitch >= c2 && command.Note.pitch <= c5) {
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
        if ("Note" in command) {
            notes.push(<rect
                key={command.id}
                x={time}
                y={command.Note.pitch - minPitch}
                width={command.Note.length}
                height={1}
            />)
        } else if ("Delay" in command) {
            time += command.Delay
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

    const tracks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] // TODO: don't show track 0

    return (
        <div
            className={styles.table}
            onClick={() => {
                selection.clear()
            }}
        >
            <View>
                {tracks.map(i => <div key={i} className={styles.track}>
                    {<div className={styles.trackHead}>
                        <TrackName index={i} />
                        {i > 0 && <TrackControls trackIndex={i} />}
                    </div>}
                </div>)}
            </View>
            {variation && <TimeGrid dragToScroll={{ axis: "both", button: 1 }}>
                {variation.segments.map((segment, segmentIndex) => {
                    if ("Subseg" in segment) {
                        return <View
                            key={segment.Subseg.id}
                            colorVersion={6}
                        >
                            {tracks.map(i => <div key={i} className={styles.track} aria-label={`Track ${i}`}>
                                <PianoRollThumbnail trackIndex={i} trackListIndex={segment.Subseg.track_list} segmentIndex={segmentIndex} />
                            </div>)}
                        </View>
                    } else {
                        const id = getSegmentId(segment)
                        console.assert(id != null, "Segment", segment, "does not have an ID")

                        return <div key={id} />
                    }
                })}
            </TimeGrid>}
        </div>
    )
}

export default function SegmentMap() {
    return <SelectionProvider>
        <Container />
    </SelectionProvider>
}
