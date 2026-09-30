import { ActionButton, Grid, View, Form, Switch, ContextualHelp, Heading, Content, Text, Flex, TextField } from "@adobe/react-spectrum"
import { Bgm } from "pm64-typegen"
import { useEffect, useId, useRef, useState } from "react"
import { useDebounce } from "use-debounce"

import Inspector from "./Inspector"
import PianoKeys, { DrumLabels } from "./PianoKeys"
import PianoRoll from "./PianoRoll"
import { usePitchLimits } from "./pitchLimit"
import { PlayheadLine } from "./Playhead"
import { useSegmentLengths } from "./Ruler"
import { SegmentTrack, useSegmentTracks } from "./segmentTracks"
import StartingValues from "./StartingValues"
import styles from "./SubsegDetails.module.scss"
import TimeGrid from "./TimeGrid"
import Tracker from "./Tracker"
import TrackLanes from "./TrackLanes"

import { DEFAULT_ALTERNATE_PARTS_NAME } from "../emu/LocationControls"
import { useBgm, useDoc, useLocation, useVariation } from "../store"
import { alternatePartOf, BgmAction, canAddAlternatePart, playingTrack } from "../store/bgm"

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

    // Track name editing is debounced to prevent dispatch spam when typing
    const [name, setName] = useState(track?.name)
    const [debouncedName] = useDebounce(name, 500)
    useEffect(() => {
        if (track?.name !== debouncedName)
            dispatch({ type: "modify_track_settings", trackList: trackListId, track: trackIndex, name: debouncedName })
    }, [debouncedName, dispatch, trackIndex, trackListId, track?.name])

    const [showTracker, setShowTracker] = useState(true)
    const segmentLengths = useSegmentLengths()
    const segments = useSegmentTracks(mainIndex)
    const pitchLimits = usePitchLimits(trackListId, trackIndex, mainIndex, segmentIndex)

    if (!track) {
        return <div>Track not found</div>
    }

    return <Grid
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
            <h3 id={hid} className={styles.regionName}>Region Settings</h3>
            {/* Spectrum gives forms a minimum width wider than the panel */}
            <Form width="100%" UNSAFE_style={{ minWidth: 0 }} aria-labelledby={hid} onSubmit={e => e.preventDefault()}>
                <TextField
                    width="100%"
                    label="Name"
                    value={name}
                    onChange={setName}
                />
                <Flex wrap columnGap="size-200">
                    <Switch isSelected={!track.is_disabled} onChange={v => dispatch({ type: "modify_track_settings", trackList: trackListId, track: trackIndex, isDisabled: !v })}>Enabled</Switch>
                    {trackIndex !== 0 && <Switch isSelected={track.is_drum_track} onChange={isDrumTrack => dispatch({ type: "modify_track_settings", trackList: trackListId, track: trackIndex, isDrumTrack })}>Percussion</Switch>}
                </Flex>
                <StartingValues trackListId={trackListId} trackIndex={trackIndex} mainIndex={mainIndex} segmentIndex={segmentIndex} />
                {trackIndex !== 0 ? <>
                    <AlternatePartForm trackListId={trackListId} trackIndex={mainIndex} segmentIndex={segmentIndex} />
                </> : <></>}
                <View paddingTop="size-300">
                    <Switch isSelected={showTracker} onChange={v => setShowTracker(v)}>Blocks view</Switch>
                </View>
            </Form>
            <Inspector trackListId={trackListId} trackIndex={trackIndex} />
        </View>
        {/* Follows the selected segment's piano roll, so it starts again when another opens */}
        <PianoKeys key={segmentIndex} region={styles.region} isDrumTrack={track.is_drum_track} pitchLimit={pitchLimits[0]?.limit} />
        {showTracker ? <Tracker trackListId={trackListId} trackIndex={trackIndex} /> : <TimeGrid style={{
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
                <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }} data-selected-roll onScroll={event => syncGreyedRolls(event.currentTarget)}>
                    <PianoRoll
                        trackListId={trackListId}
                        trackIndex={trackIndex}
                        pitchLimits={pitchLimits}
                        segmentStart={segmentLengths.slice(0, segmentIndex).reduce((sum, length) => sum + length, 0)}
                    />
                </div>
                <TrackLanes
                    trackListId={trackListId}
                    trackIndex={trackIndex}
                    mainIndex={mainIndex}
                    segmentIndex={segmentIndex}
                    length={segmentLengths[segmentIndex] ?? 0}
                />
            </div>
            {track.is_drum_track && <DrumLabels key={segmentIndex} region={styles.region} />}
            <PlayheadLine />
        </TimeGrid>}
    </Grid>
}

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
            aria-label="Open this segment"
            onClick={() => docDispatch({
                type: "set_panel_content",
                panelContent: { type: "tracker", trackList: segment.trackListId, track: mainIndex, segment: segmentIndex },
            })}
        />
    </div>
}

/** Adds or removes the alternate part for track `trackIndex` of track list `trackListId`. */
function AlternatePartForm({ trackListId, trackIndex, segmentIndex }: Props) {
    const [bgm, dispatch] = useBgm()
    const [variation] = useVariation()
    const trackList = bgm?.track_lists[trackListId]

    if (!bgm || !trackList) {
        return null
    }

    const name = bgm.alternate_parts_name ?? DEFAULT_ALTERNATE_PARTS_NAME
    const variationTrackLists = (variation?.segments ?? [])
        .flatMap(segment => ("Subseg" in segment ? [segment.Subseg.track_list] : []))

    const label = <Flex width="100%" alignItems="center">
        <Text flexGrow={1}>{name}</Text>
        <ContextualHelp variant="help" placement="right">
            <Heading>Alternate parts</Heading>
            <Content>
                <Text>
                    An alternate part plays <b>instead of this track</b> when the game turns alternate parts on, such as
                    near the oasis in Dry Dry Desert. It plays in step with this track and uses its voices.
                </Text>
            </Content>
        </ContextualHelp>
    </Flex>

    if (alternatePartOf(trackList, trackIndex) !== undefined) {
        return <View>
            <Text>{label}</Text>
            <ActionButton onPress={() => dispatch({ type: "remove_alternate_part", trackList: trackListId, track: trackIndex })}>
                Remove alternate part
            </ActionButton>
        </View>
    }

    const canAdd = canAddAlternatePart(trackList, trackIndex)
    return <View>
        <Text>{label}</Text>
        <Flex direction="column" gap="size-50" marginTop="size-50">
            <ActionButton
                width="100%"
                isDisabled={!canAdd}
                onPress={() => dispatch({ type: "add_alternate_part", trackLists: [trackListId], track: trackIndex })}
            >
                Add in this segment
            </ActionButton>
            <ActionButton
                width="100%"
                isDisabled={!canAdd}
                onPress={() => dispatch({ type: "add_alternate_part", trackLists: variationTrackLists, track: trackIndex })}
            >
                Add in every segment
            </ActionButton>
            {!canAdd && <Text UNSAFE_style={{ fontSize: "0.85em" }}>No free track after this one in segment {segmentIndex + 1}.</Text>}
        </Flex>
    </View>
}
