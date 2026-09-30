import { Grid, View, Form, Switch, Flex } from "@adobe/react-spectrum"
import { Bgm, Event } from "pm64-typegen"
import { useEffect, useId, useRef, useState } from "react"
import { DragDropContext, Droppable, DropResult } from "react-beautiful-dnd"

import EditableName from "./EditableName"
import Inspector from "./Inspector"
import PianoKeys, { DrumLabels } from "./PianoKeys"
import PianoRoll from "./PianoRoll"
import { usePitchLimits } from "./pitchLimit"
import { PlayheadLine } from "./Playhead"
import { useSegmentLengths } from "./Ruler"
import { SegmentTrack, useInstrumentName, useSegmentTracks } from "./segmentTracks"
import { SegmentStart } from "./snap"
import StartingValues from "./StartingValues"
import styles from "./SubsegDetails.module.scss"
import TimeGrid from "./TimeGrid"
import Tracker from "./Tracker"
import TrackLanes from "./TrackLanes"

import Bridge from "../bridge"
import { useBgm, useDoc, useLocation } from "../store"
import { BgmAction, playingTrack, playsDrums } from "../store/bgm"

export interface Props {
    trackListId: number
    trackIndex: number
    segmentIndex: number
}

export default function SubsegDetails({ trackListId, trackIndex: mainIndex, segmentIndex }: Props) {
    const hid = useId()
    const [bgm, dispatch]: [Bgm | undefined, (action: BgmAction) => void] = useBgm()
    const [location] = useLocation()
    const trackList = bgm?.track_lists[trackListId]
    // Shows the alternate part when it's the one that plays
    const trackIndex = trackList ? playingTrack(trackList, mainIndex, location.alternateParts) : mainIndex
    const track = trackList?.tracks[trackIndex]

    const segmentLengths = useSegmentLengths()
    const segmentStart = segmentLengths.slice(0, segmentIndex).reduce((sum, length) => sum + length, 0)
    const segments = useSegmentTracks(mainIndex)
    const pitchLimits = usePitchLimits(trackListId, trackIndex, mainIndex, segmentIndex)
    // The blocks view lists the track's commands to edit one by one, for what the piano roll and its lanes don't show
    const [showBlocks, setShowBlocks] = useState(false)
    const instrumentName = useInstrumentName(track?.commands, track && bgm ? playsDrums(bgm, track, location.mix) : false, mainIndex, segmentIndex)

    if (!track || !bgm) {
        return <div>Track not found</div>
    }
    const isDrumTrack = playsDrums(bgm, track, location.mix)

    // A block dragged within the list moves, and one dragged out of it is deleted
    const onDragEnd = (result: DropResult) => {
        if (!result.destination) {
            return
        } else if (result.destination.droppableId === TRASH) {
            const id = (Bridge.commands_without_detours(track.commands) as Event[])[result.source.index]?.id
            if (id !== undefined) {
                dispatch({ type: "delete_track_commands", trackList: trackListId, track: trackIndex, ids: [id] })
            }
        } else {
            dispatch({
                type: "move_track_command",
                trackList: trackListId,
                track: trackIndex,
                oldIndex: result.source.index,
                newIndex: result.destination.index,
            })
        }
    }

    const region = <Grid
        // The settings and keyboard together are as wide as the track names above, so the timeline lines up with theirs
        columns="189px 36px 1fr"
        UNSAFE_className={styles.region}
        // One row as tall as the panel, so the piano roll is fitted to it from the start and opens on its notes
        UNSAFE_style={{ gridTemplateRows: "minmax(0, 1fr)" }}
        height="100%"
    >
        <View
            padding="size-150"
            borderEndColor="gray-100"
            borderEndWidth="thin"
            UNSAFE_className={styles.panel}
        >
            <EditableName
                id={hid}
                name={track.name ?? ""}
                placeholder={instrumentName ?? "Unnamed region"}
                label="Region"
                className={styles.regionName}
                onRename={name => dispatch({ type: "modify_track_settings", trackList: trackListId, track: trackIndex, name })}
            />
            {/* Spectrum gives forms a minimum width wider than the panel */}
            <Form width="100%" UNSAFE_style={{ minWidth: 0 }} aria-labelledby={hid} onSubmit={e => e.preventDefault()}>
                <Flex wrap columnGap="size-200">
                    {trackIndex !== 0 && <Switch isSelected={isDrumTrack} onChange={isDrumTrack => dispatch({ type: "modify_track_settings", trackList: trackListId, track: trackIndex, isDrumTrack })}>Percussion</Switch>}
                    <Switch isSelected={showBlocks} onChange={setShowBlocks}>Blocks</Switch>
                </Flex>
                <StartingValues trackListId={trackListId} trackIndex={trackIndex} mainIndex={mainIndex} segmentIndex={segmentIndex} />
            </Form>
            {showBlocks && <Inspector trackListId={trackListId} trackIndex={trackIndex} />}
        </View>
        {showBlocks ? <div style={{ gridColumn: "2 / -1", minHeight: 0 }}>
            <Tracker trackListId={trackListId} trackIndex={trackIndex} />
        </div> : <>
            {/* Follows the selected segment's piano roll, so it starts again when another opens */}
            <PianoKeys key={segmentIndex} region={styles.region} isDrumTrack={isDrumTrack} pitchLimit={pitchLimits[0]?.limit} />
            <TimeGrid style={{
                "backgroundColor": "var(--spectrum-gray-75)",
                // The piano roll is dark whatever the theme.
                "--playhead-line-color": "rgb(255 255 255 / 50%)",
            } as React.CSSProperties}>
                {segments.map((segment, index) => segment && index !== segmentIndex && <GreyedSegment
                    key={index}
                    segment={segment}
                    mainIndex={mainIndex}
                    segmentIndex={index}
                    segmentStart={segmentLengths.slice(0, index).reduce((sum, length) => sum + length, 0)}
                    length={segmentLengths[index] ?? 0}
                />)}
                {/* Every segment is in the one row, whatever order they're in here */}
                <div style={{ gridColumn: segmentIndex + 1, gridRow: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                    <SegmentStart.Provider value={segmentStart}>
                        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }} data-selected-roll onScroll={event => syncGreyedRolls(event.currentTarget)}>
                            <PianoRoll
                                trackListId={trackListId}
                                trackIndex={trackIndex}
                                pitchLimits={pitchLimits}
                                segmentStart={segmentStart}
                            />
                        </div>
                        <TrackLanes
                            trackListId={trackListId}
                            trackIndex={trackIndex}
                            mainIndex={mainIndex}
                            segmentIndex={segmentIndex}
                            length={segmentLengths[segmentIndex] ?? 0}
                        />
                    </SegmentStart.Provider>
                </div>
                {isDrumTrack && <DrumLabels key={segmentIndex} region={styles.region} />}
                <PlayheadLine />
            </TimeGrid>
        </>}
    </Grid>

    if (!showBlocks) {
        return region
    }
    return <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId={TRASH}>
            {provided => <div ref={provided.innerRef} {...provided.droppableProps} style={{ height: "100%" }}>
                {region}
                {provided.placeholder}
            </div>}
        </Droppable>
    </DragDropContext>
}

/** Where a block dragged out of the blocks view goes: anywhere else in the region's view, which deletes it. */
const TRASH = "trash"

/** Scrolls the greyed segments' piano rolls to the pitches the selected one shows, so their notes line up. */
function syncGreyedRolls(selected: HTMLElement) {
    for (const roll of selected.closest("[data-time-grid]")?.querySelectorAll<HTMLElement>("[data-greyed-roll]") ?? []) {
        roll.scrollTop = selected.scrollTop
    }
}

/**
 * The track in another segment, greyed out beside the one being edited so it shows what comes before and after. It
 * can't be edited, but clicking it opens it.
 */
function GreyedSegment({ segment, mainIndex, segmentIndex, segmentStart, length }: {
    segment: SegmentTrack
    mainIndex: number
    segmentIndex: number
    segmentStart: number
    length: number
}) {
    const [, docDispatch] = useDoc()
    const roll = useRef<HTMLDivElement>(null)
    const pitchLimits = usePitchLimits(segment.trackListId, segment.trackIndex, mainIndex, segmentIndex)

    // Line up with the selected segment's pitches once this one has centred itself on its own notes
    useEffect(() => {
        const selected = roll.current?.closest("[data-time-grid]")?.querySelector<HTMLElement>("[data-selected-roll]")
        if (selected && roll.current) {
            roll.current.scrollTop = selected.scrollTop
        }
    }, [])

    return <div className={styles.greyed} style={{ gridColumn: segmentIndex + 1, gridRow: 1 }}>
        {/* Inert, so none of it can be pressed, focused, or edited */}
        <div className={styles.greyedContent} {...{ inert: "" }}>
            <div ref={roll} style={{ flex: 1, overflow: "hidden", minHeight: 0 }} data-greyed-roll>
                <PianoRoll trackListId={segment.trackListId} trackIndex={segment.trackIndex} segmentStart={segmentStart} pitchLimits={pitchLimits} />
            </div>
            <TrackLanes
                trackListId={segment.trackListId}
                trackIndex={segment.trackIndex}
                mainIndex={mainIndex}
                segmentIndex={segmentIndex}
                length={length}
                isGreyed
            />
        </div>
        <button
            className={styles.openGreyed}
            aria-label="Open this region"
            onClick={() => docDispatch({
                type: "set_panel_content",
                panelContent: { type: "tracker", trackList: segment.trackListId, track: mainIndex, segment: segmentIndex },
            })}
        />
    </div>
}
