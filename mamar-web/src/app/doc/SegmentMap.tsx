import { View } from "@adobe/react-spectrum"
import classNames from "classnames"
import type { Event } from "pm64-typegen"
import { useId, useDeferredValue, useMemo, memo, startTransition, useState } from "react"
import { ChevronDown, ChevronRight, Plus } from "react-feather"

import EditableName from "./EditableName"
import { PlayheadLine } from "./Playhead"
import { useSegmentLengths, useTicksPerBar } from "./Ruler"
import SegmentEnd from "./SegmentEnd"
import styles from "./SegmentMap.module.scss"
import { commandsForMix, commandsVaryByMix, useInstrumentName } from "./segmentTracks"
import { SegmentStart } from "./snap"
import SongLanes from "./SongLanes"
import TimeGrid from "./TimeGrid"
import TrackMeter from "./TrackMeter"
import VoiceBudget from "./VoiceBudget"
import { budget, sharesVoices, useVoiceReport } from "./voices"

import Bridge from "../bridge"
import TrackControls from "../emu/TrackControls"
import { useBgm, useDoc, useLocation, useRoot, useVariation } from "../store"
import { ALTERNATE_PART_NAME, alternatePartOf, MAIN_PART_NAME, mixCount, mixName, playsDrums } from "../store/bgm"
import { getSegmentId } from "../store/segment"
import useSelection, { SelectionProvider } from "../util/hooks/useSelection"

/**
 * Track `trackIndex` in one segment, or its alternate part if `isAlternatePart`, as it plays in proximity mix `mix`,
 * or the mix being listened to. Clicking it opens it in the region view, and plays that version and mix, so what's
 * edited is what's heard. In a row of one version of the track, `isVersion`, it's shown as a version is.
 */
function PianoRollThumbnail({ trackIndex, trackListIndex, segmentIndex, isAlternatePart = false, mix, isVersion = mix !== undefined }: {
    trackIndex: number
    trackListIndex: number
    segmentIndex: number
    isAlternatePart?: boolean
    mix?: number
    isVersion?: boolean
}) {
    const [doc] = useDoc()
    const [root, rootDispatch] = useRoot()
    const [bgm] = useBgm()
    const [location] = useLocation()
    const trackList = bgm?.track_lists[trackListIndex]
    const shownIndex = isAlternatePart ? (trackList && alternatePartOf(trackList, trackIndex)) : trackIndex
    const voices = useVoiceReport(trackListIndex)?.voices
    const track = shownIndex !== undefined ? trackList?.tracks[shownIndex] : undefined
    const isSelected = doc?.panelContent.type === "tracker" && doc?.panelContent.trackList === trackListIndex &&
        doc?.panelContent.track === trackIndex && location.alternateParts === isAlternatePart &&
        (mix === undefined || location.mix === mix)
    const nameId = useId()
    const instrumentName = useInstrumentName(track?.commands, track && bgm ? playsDrums(bgm, track, mix ?? location.mix) : false, trackIndex, segmentIndex)
    const commands = useDeferredValue(track && bgm ? commandsForMix(track.commands, bgm.branches, mix ?? location.mix) : undefined)

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
                    { type: "doc", id, action: { type: "set_location", location: { alternateParts: isAlternatePart, ...(mix === undefined ? {} : { mix }) } } },
                )
            })
            evt.stopPropagation()
            evt.preventDefault()
        }

        // Alternate parts play on the voices of the tracks they're for
        const voiceIndex = track.alternate_for ?? shownIndex
        const level = voices ? budget(voices) : "fits"
        const isShortOfVoices = level === "over" && voices!.given[voiceIndex] < voices!.needed[voiceIndex]
        const isSharingVoices = !isShortOfVoices && level !== "fits" && sharesVoices(voices!, voiceIndex)

        return <div
            tabIndex={0}
            title={isShortOfVoices
                ? `Gets ${voices!.given[voiceIndex]} voices but needs ${voices!.needed[voiceIndex]}, so some notes are cut off. See the voice budget under these regions for why.`
                : isSharingVoices
                    ? "Plays on voices that sound effects share, so sound effects can cut its notes off. See the voice budget under these regions for why."
                    : undefined}
            aria-labelledby={isVersion ? undefined : nameId}
            aria-label={isVersion ? track.name || instrumentName : undefined}
            className={classNames({
                [styles.pianoRollThumbnail]: true,
                [styles.drumRegion]: track.is_drum_track,
                [styles.disabledRegion]: track.is_disabled,
                [styles.showsVersion]: isVersion,
                // Vanilla tracks often have fewer voices than notes at once, letting a note cut off the end of the one
                // before, so this only warns when the segment needs more voices than the game has
                [styles.shortOfVoices]: isShortOfVoices,
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
            {/* A version's row is under the track's, which names the region */}
            {!isVersion && <div id={nameId} className={classNames(styles.segmentName, { [styles.instrumentName]: !track.name })}>
                {/* A region without a name of its own is called after its instrument */}
                {track.name || instrumentName}
            </div>}
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

/**
 * A row of the segment map: a track, one of its versions, which show under it when it's expanded, or the place to add
 * a mix to it. A track's versions are its mixes, or, in songs that have them, it and its alternate part.
 */
type Row = { trackIndex: number } & (
    | { kind: "track" }
    | { kind: "mix", mix: number }
    | { kind: "alternate", isAlternatePart: boolean }
    | { kind: "add" }
)

/** The name of a version of a track, under the track. See {@link EditableName}. */
function VersionName({ name, isPlaying, onRename, onDelete }: {
    name: string
    isPlaying: boolean
    onRename?(name: string): void
    onDelete?(): void
}) {
    return <EditableName
        name={name}
        label="Mix"
        className={styles.versionHead}
        nameClassName={classNames(styles.versionName, { [styles.playingVersion]: isPlaying })}
        onRename={onRename}
        onDelete={onDelete}
    />
}

function Container() {
    const [variation] = useVariation()
    const [bgm, dispatch] = useBgm()
    const [location, setLocation] = useLocation()
    const selection = useSelection()
    const segmentLengths = useSegmentLengths()

    // Rows used only by alternate parts are hidden, as alternate parts show in rows under the tracks they're for
    const trackLists = (variation?.segments ?? [])
        .flatMap(segment => ("Subseg" in segment ? [segment.Subseg.track_list] : []))
        .filter(id => bgm?.track_lists[id] !== undefined)
    const isAlternatePartsRow = (i: number) =>
        trackLists.some(id => bgm!.track_lists[id].tracks[i].alternate_for != null) &&
        trackLists.every(id => bgm!.track_lists[id].tracks[i].alternate_for != null || bgm!.track_lists[id].tracks[i].commands.length === 0)
    // The master track's commands show as lanes above, and its length as the segment's
    const tracks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].filter(i => !isAlternatePartsRow(i))
    const hasAlternateParts = (i: number) => trackLists.some(id => alternatePartOf(bgm!.track_lists[id], i) !== undefined)
    const variesByMix = (i: number) => bgm !== undefined && trackLists.some(id => commandsVaryByMix(bgm.track_lists[id].tracks[i].commands, bgm.branches))
    const hasCommands = (i: number) => trackLists.some(id => bgm!.track_lists[id].tracks[i].commands.length > 0)
    const [expanded, setExpanded] = useState<number[]>([])
    const ticksPerBar = useTicksPerBar()
    const mixes = bgm ? mixCount(bgm) : 0

    const rows: Row[] = tracks.flatMap((i): Row[] => {
        if (!expanded.includes(i)) {
            return [{ trackIndex: i, kind: "track" }]
        } else if (hasAlternateParts(i)) {
            return [
                { trackIndex: i, kind: "track" },
                { trackIndex: i, kind: "alternate", isAlternatePart: false },
                { trackIndex: i, kind: "alternate", isAlternatePart: true },
            ]
        }
        const mixRows: Row[] = variesByMix(i) ? Array.from({ length: mixes }, (_, mix) => ({ trackIndex: i, kind: "mix", mix })) : []
        return [{ trackIndex: i, kind: "track" }, ...mixRows, { trackIndex: i, kind: "add" }]
    })
    // The rows render in a transition, as a track's mixes can be many, so the badge responds at once
    const toggle = (i: number) => startTransition(() => {
        setExpanded(open => (open.includes(i) ? open.filter(other => other !== i) : [...open, i]))
    })
    const rowKey = (row: Row) => `${row.trackIndex}-${row.kind}-${"mix" in row ? row.mix : "isAlternatePart" in row ? row.isAlternatePart : ""}`
    // The version of each track that plays, and so the one its row shows
    const playing = (i: number) => (variesByMix(i) ? mixName(bgm!, location.mix) : hasAlternateParts(i) ? (location.alternateParts ? ALTERNATE_PART_NAME : MAIN_PART_NAME) : undefined)

    // Adds a mix to the song, and makes the track vary by mix if it doesn't, playing the new mix
    const addMix = (i: number) => {
        if (variesByMix(i)) {
            dispatch({ type: "add_mix" })
            setLocation({ mix: mixes, alternateParts: false })
        } else {
            dispatch({ type: "vary_by_mix", trackLists, track: i, interval: ticksPerBar })
            setLocation({ mix: Math.max(1, mixes - 1), alternateParts: false })
        }
    }

    const head = (row: Row) => {
        const i = row.trackIndex
        switch (row.kind) {
        case "mix":
            return <VersionName
                name={mixName(bgm!, row.mix)}
                isPlaying={row.mix === location.mix}
                onRename={name => dispatch({ type: "set_mix_name", mix: row.mix, name })}
                onDelete={() => {
                    dispatch({ type: "remove_mix", mix: row.mix })
                    // The mixes after it move down, and deleting the one that plays plays the one before it
                    if (location.mix >= row.mix && location.mix > 0) {
                        setLocation({ mix: location.mix - 1 })
                    }
                }}
            />
        case "alternate":
            return <VersionName name={row.isAlternatePart ? ALTERNATE_PART_NAME : MAIN_PART_NAME} isPlaying={row.isAlternatePart === location.alternateParts} />
        case "add":
            return <button className={styles.addMix} onClick={event => {
                event.stopPropagation()
                addMix(i)
            }}>
                <Plus size={12} /> Add mix
            </button>
        case "track": {
            const version = playing(i)
            return <>
                <div className={styles.trackTitle}>
                    <TrackName index={i} />
                    {(version !== undefined || hasCommands(i)) && <button
                        className={classNames(styles.versionsToggle, { [styles.hasVersions]: version !== undefined })}
                        aria-expanded={expanded.includes(i)}
                        aria-label={version === undefined ? "Show mixes" : undefined}
                        onClick={event => {
                            event.stopPropagation()
                            toggle(i)
                        }}
                    >
                        {expanded.includes(i) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        {version}
                    </button>}
                </div>
                <TrackControls
                    trackIndex={i}
                    alternateParts={[...new Set(trackLists.map(id => alternatePartOf(bgm!.track_lists[id], i)).filter(slot => slot !== undefined))]}
                />
                <TrackMeter trackIndex={i} />
            </>
        }
        }
    }

    const cell = (row: Row, trackListId: number, segmentIndex: number) => {
        const i = row.trackIndex
        const trackList = bgm!.track_lists[trackListId]
        const hasAlternatePart = alternatePartOf(trackList, i) !== undefined
        switch (row.kind) {
        case "mix":
            return commandsVaryByMix(trackList.tracks[i].commands, bgm!.branches) &&
                <PianoRollThumbnail trackIndex={i} trackListIndex={trackListId} segmentIndex={segmentIndex} mix={row.mix} />
        case "alternate":
            return (!row.isAlternatePart || hasAlternatePart) &&
                <PianoRollThumbnail trackIndex={i} trackListIndex={trackListId} segmentIndex={segmentIndex} isAlternatePart={row.isAlternatePart} isVersion />
        case "add":
            return null
        case "track":
            return <PianoRollThumbnail
                trackIndex={i}
                trackListIndex={trackListId}
                segmentIndex={segmentIndex}
                isAlternatePart={location.alternateParts && hasAlternatePart}
            />
        }
    }

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
                {rows.map(row => <div key={rowKey(row)} className={classNames(styles.track, { [styles.versionRow]: row.kind !== "track" })}>
                    <div className={styles.trackHead}>{head(row)}</div>
                </div>)}
            </View>
            {variation && <TimeGrid dragToScroll={{ axis: "both", button: 1 }}>
                {variation.segments.map((segment, segmentIndex) => {
                    if ("Subseg" in segment) {
                        return <View
                            key={segment.Subseg.id}
                            colorVersion={6}
                            UNSAFE_className={styles.segment}
                        >
                            {rows.map(row => <div
                                key={rowKey(row)}
                                className={classNames(styles.track, { [styles.versionRow]: row.kind !== "track" })}
                                aria-label={`Track ${row.trackIndex}`}
                            >
                                {cell(row, segment.Subseg.track_list, segmentIndex)}
                            </div>)}
                            <VoiceBudget
                                trackListId={segment.Subseg.track_list}
                                segmentIndex={segmentIndex}
                                segmentStart={segmentLengths.slice(0, segmentIndex).reduce((sum, length) => sum + length, 0)}
                            />
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
