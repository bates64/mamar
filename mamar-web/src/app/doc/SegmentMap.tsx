import { View } from "@adobe/react-spectrum"
import classNames from "classnames"
import type { Event } from "pm64-typegen"
import { useId, useDeferredValue, useMemo, memo, startTransition } from "react"
import { Plus } from "react-feather"

import { PlayheadLine } from "./Playhead"
import { useSegmentLengths } from "./Ruler"
import SegmentEnd from "./SegmentEnd"
import styles from "./SegmentMap.module.scss"
import { SegmentStart } from "./snap"
import SongLanes from "./SongLanes"
import TimeGrid from "./TimeGrid"
import { MAX_VOICES, total, useVoices } from "./voices"

import Bridge from "../bridge"
import TrackControls from "../emu/TrackControls"
import { useBgm, useDoc, useLocation, useRoot, useVariation } from "../store"
import { alternatePartOf, canAddAlternatePart } from "../store/bgm"
import { getSegmentId } from "../store/segment"
import useSelection, { SelectionProvider } from "../util/hooks/useSelection"

/** The name of a track's alternate part, which plays instead of it when the game turns alternate parts on. */
const ALTERNATE = "Alternate"

/**
 * Track `trackIndex` in one segment, or its alternate part if `isAlternatePart`. Clicking it opens it in the region
 * view, and plays that version, so the version being edited is the one heard.
 */
function PianoRollThumbnail({ trackIndex, trackListIndex, segmentIndex, isAlternatePart = false }: {
    trackIndex: number
    trackListIndex: number
    segmentIndex: number
    isAlternatePart?: boolean
}) {
    const [doc] = useDoc()
    const [root, rootDispatch] = useRoot()
    const [bgm] = useBgm()
    const [location] = useLocation()
    const trackList = bgm?.track_lists[trackListIndex]
    const shownIndex = isAlternatePart ? (trackList && alternatePartOf(trackList, trackIndex)) : trackIndex
    const voices = useVoices(trackListIndex)
    const track = shownIndex !== undefined ? trackList?.tracks[shownIndex] : undefined
    const isSelected = doc?.panelContent.type === "tracker" && doc?.panelContent.trackList === trackListIndex &&
        doc?.panelContent.track === trackIndex && location.alternateParts === isAlternatePart
    const nameId = useId()
    const commands = useDeferredValue(track?.commands)

    // Tracks that are alternate parts show in the rows under the tracks they're for
    if (!track || shownIndex === undefined || track.commands.length === 0 || (!isAlternatePart && track.alternate_for != null)) {
        return <></>
    } else {
        const handlePress = (evt: any) => {
            const id = root.activeDocId
            if (!id) return
            startTransition(() => {
                // One dispatch, so that both change the same state
                rootDispatch(
                    {
                        type: "doc",
                        id,
                        action: {
                            type: "set_panel_content",
                            panelContent: isSelected ? { type: "not_open" } : {
                                type: "tracker",
                                trackList: trackListIndex,
                                track: trackIndex,
                                segment: segmentIndex,
                            },
                        },
                    },
                    { type: "doc", id, action: { type: "set_location", location: { alternateParts: isAlternatePart } } },
                )
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
                [styles.showsAlternatePart]: isAlternatePart,
                // Vanilla tracks often have fewer voices than notes at once, letting a note cut off the end of the one
                // before, so this only warns when the segment needs more voices than the game has
                [styles.shortOfVoices]: voices !== undefined && total(voices.needed) > MAX_VOICES &&
                    voices.given[shownIndex] < voices.needed[shownIndex],
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
            </div>
        </div>
    }
}

/**
 * The place for track `trackIndex`'s alternate part in a segment without one. Clicking it adds one, a copy of the
 * track, if the segment has a free track for it.
 */
function AddAlternatePart({ trackIndex, trackListIndex }: { trackIndex: number, trackListIndex: number }) {
    const [bgm, dispatch] = useBgm()
    const trackList = bgm?.track_lists[trackListIndex]
    if (!trackList || trackList.tracks[trackIndex].commands.length === 0 || !canAddAlternatePart(bgm, trackListIndex, trackIndex)) {
        return null
    }
    return <button
        className={styles.addAlternatePart}
        onClick={event => {
            event.stopPropagation()
            dispatch({ type: "add_alternate_part", trackLists: [trackListIndex], track: trackIndex })
        }}
    >
        <Plus size={14} />
    </button>
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
    const segmentLengths = useSegmentLengths()

    // Rows used only by alternate parts are hidden, as alternate parts show in rows under the tracks they're for
    const trackLists = (variation?.segments ?? [])
        .map(segment => ("Subseg" in segment ? bgm?.track_lists[segment.Subseg.track_list] : undefined))
        .filter(trackList => trackList !== undefined)
    const isAlternatePartsRow = (i: number) =>
        trackLists.some(trackList => trackList.tracks[i].alternate_for != null) &&
        trackLists.every(trackList => trackList.tracks[i].alternate_for != null || trackList.tracks[i].commands.length === 0)
    // The master track's commands show as lanes above, and its length as the segment's
    const tracks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].filter(i => !isAlternatePartsRow(i))
    const hasAlternateParts = (i: number) => trackLists.some(trackList => alternatePartOf(trackList, i) !== undefined)
    const rows = tracks.flatMap(i => (hasAlternateParts(i)
        ? [{ trackIndex: i, isAlternatePart: false }, { trackIndex: i, isAlternatePart: true }]
        : [{ trackIndex: i, isAlternatePart: false }]))

    return (
        <div
            className={styles.table}
            onClick={() => {
                selection.clear()
            }}
        >
            <div className={styles.songLanes}>
                <SongLanes />
            </div>
            <View>
                {rows.map(({ trackIndex: i, isAlternatePart }) => (isAlternatePart
                    ? <div key={`${i}-alternate`} className={classNames(styles.track, styles.alternatePartRow)}>
                        <div className={styles.trackHead}>
                            <div className={styles.alternatePartName}>{ALTERNATE}</div>
                        </div>
                    </div>
                    : <div key={i} className={styles.track}>
                        <div className={styles.trackHead}>
                            <TrackName index={i} />
                            {i > 0 && <TrackControls
                                trackIndex={i}
                                alternateParts={[...new Set(trackLists.map(trackList => alternatePartOf(trackList, i)).filter(slot => slot !== undefined))]}
                            />}
                        </div>
                    </div>))}
            </View>
            {variation && <TimeGrid dragToScroll={{ axis: "both", button: 1 }}>
                {variation.segments.map((segment, segmentIndex) => {
                    if ("Subseg" in segment) {
                        return <View
                            key={segment.Subseg.id}
                            colorVersion={6}
                            UNSAFE_className={styles.segment}
                        >
                            {rows.map(({ trackIndex: i, isAlternatePart }) => (isAlternatePart
                                ? <div
                                    key={`${i}-alternate`}
                                    className={classNames(styles.track, styles.alternatePartRow)}
                                    aria-label={`Track ${i}, ${ALTERNATE}`}
                                >
                                    {alternatePartOf(bgm!.track_lists[segment.Subseg.track_list], i) !== undefined
                                        ? <PianoRollThumbnail trackIndex={i} trackListIndex={segment.Subseg.track_list} segmentIndex={segmentIndex} isAlternatePart />
                                        : <AddAlternatePart trackIndex={i} trackListIndex={segment.Subseg.track_list} />}
                                </div>
                                : <div key={i} className={styles.track} aria-label={`Track ${i}`}>
                                    <PianoRollThumbnail trackIndex={i} trackListIndex={segment.Subseg.track_list} segmentIndex={segmentIndex} />
                                </div>))}
                            <SegmentStart.Provider value={segmentLengths.slice(0, segmentIndex).reduce((sum, length) => sum + length, 0)}>
                                <SegmentEnd trackListId={segment.Subseg.track_list} length={segmentLengths[segmentIndex]} />
                            </SegmentStart.Provider>
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
