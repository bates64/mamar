import { View } from "@adobe/react-spectrum"
import classNames from "classnames"
import type { Event } from "pm64-typegen"
import { useId, useDeferredValue, useMemo, memo, startTransition } from "react"

import { PlayheadLine } from "./Playhead"
import styles from "./SegmentMap.module.scss"
import TimeGrid from "./TimeGrid"

import Bridge from "../bridge"
import { DEFAULT_ALTERNATE_PARTS_NAME } from "../emu/LocationControls"
import TrackControls from "../emu/TrackControls"
import { useBgm, useDoc, useLocation, useVariation } from "../store"
import { alternatePartOf, playingTrack } from "../store/bgm"
import { getSegmentId } from "../store/segment"
import useSelection, { SelectionProvider } from "../util/hooks/useSelection"

function PianoRollThumbnail({ trackIndex, trackListIndex, segmentIndex }: { trackIndex: number, trackListIndex: number, segmentIndex: number }) {
    const [doc, dispatch] = useDoc()
    const [bgm] = useBgm()
    const [location] = useLocation()
    const trackList = bgm?.track_lists[trackListIndex]
    const hasAlternatePart = trackList !== undefined && alternatePartOf(trackList, trackIndex) !== undefined
    const isAlternatePart = trackList?.tracks[trackIndex]?.alternate_for != null
    const shownIndex = trackList ? playingTrack(trackList, trackIndex, location.alternateParts) : trackIndex
    const track = trackList?.tracks[shownIndex]
    const isSelected = doc?.panelContent.type === "tracker" && doc?.panelContent.trackList === trackListIndex && doc?.panelContent.track === trackIndex
    const nameId = useId()
    const commands = useDeferredValue(track?.commands)

    // Alternate parts show in the row of the track they're for
    if (!track || track.commands.length === 0 || isAlternatePart) {
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
                [styles.showsAlternatePart]: shownIndex !== trackIndex,
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
            <div id={nameId} className={styles.segmentName}>
                {track.name}
                {hasAlternatePart && <span className={styles.versionTag}>
                    {shownIndex !== trackIndex ? bgm?.alternate_parts_name ?? DEFAULT_ALTERNATE_PARTS_NAME : "Main"}
                </span>}
            </div>
        </div>
    }
}

function TrackName({ index }: { index: number }) {
    return <div className={styles.trackName}>
        {index === 0 ? "Master" : `Track ${index}`}
    </div>
}

const Thumbnail = memo(({ commands: stored }: { commands: Event[] }) => {
    const commands: Event[] = useMemo(() => Bridge.commands_without_detours(stored), [stored])

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
    const [bgm] = useBgm()
    const selection = useSelection()

    // Rows used only by alternate parts are hidden, as they show in the rows of the tracks they're for.
    const trackLists = (variation?.segments ?? [])
        .map(segment => ("Subseg" in segment ? bgm?.track_lists[segment.Subseg.track_list] : undefined))
        .filter(trackList => trackList !== undefined)
    const isAlternatePartsRow = (i: number) =>
        trackLists.some(trackList => trackList.tracks[i].alternate_for != null) &&
        trackLists.every(trackList => trackList.tracks[i].alternate_for != null || trackList.tracks[i].commands.length === 0)
    // The master track's commands show as lanes above, and its length as the segment's
    const tracks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].filter(i => !isAlternatePartsRow(i))

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
                        {i > 0 && <TrackControls
                            trackIndex={i}
                            alternateParts={[...new Set(trackLists.map(trackList => alternatePartOf(trackList, i)).filter(slot => slot !== undefined))]}
                        />}
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
                <PlayheadLine />
            </TimeGrid>}
        </div>
    )
}

export default function SegmentMap() {
    return <SelectionProvider>
        <Container />
    </SelectionProvider>
}
