import { ActionButton, Grid, View, Form, Switch, ContextualHelp, Heading, Content, Text, Flex, TextField } from "@adobe/react-spectrum"
import { Bgm } from "pm64-typegen"
import { useEffect, useId, useState } from "react"
import { useDebounce } from "use-debounce"

import Inspector from "./Inspector"
import PianoRoll from "./PianoRoll"
import { PlayheadLine } from "./Playhead"
import { useSegmentLengths } from "./Ruler"
import StartingValues from "./StartingValues"
import styles from "./SubsegDetails.module.scss"
import TimeGrid from "./TimeGrid"
import Tracker from "./Tracker"
import TrackLanes from "./TrackLanes"
import { MAX_VOICES, total, useVoices } from "./voices"

import { DEFAULT_ALTERNATE_PARTS_NAME } from "../emu/LocationControls"
import { useBgm, useLocation, useVariation } from "../store"
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

    if (!track) {
        return <div>Track not found</div>
    }

    return <Grid
        columns="225px 1fr"
        height="100%"
    >
        {/* Scrolls when its settings are taller than the piano roll */}
        <View
            padding="size-150"
            borderEndColor="gray-100"
            borderEndWidth="thin"
            overflow="auto"
            minHeight={0}
            UNSAFE_style={{ userSelect: "none" }}
        >
            <h3 id={hid} className={styles.regionName}>Region Settings</h3>
            <Form maxWidth="size-2000" aria-labelledby={hid} onSubmit={e => e.preventDefault()}>
                <TextField
                    label="Name"
                    value={name}
                    onChange={setName}
                />
                <Flex wrap columnGap="size-200">
                    <Switch isSelected={!track.is_disabled} onChange={v => dispatch({ type: "modify_track_settings", trackList: trackListId, track: trackIndex, isDisabled: !v })}>Enabled</Switch>
                    {trackIndex !== 0 && <Switch isSelected={track.is_drum_track} onChange={isDrumTrack => dispatch({ type: "modify_track_settings", trackList: trackListId, track: trackIndex, isDrumTrack })}>Percussion</Switch>}
                </Flex>
                {trackIndex !== 0 ? <>
                    <VoicesInfo trackListId={trackListId} trackIndex={trackIndex} />
                    <AlternatePartForm trackListId={trackListId} trackIndex={mainIndex} segmentIndex={segmentIndex} />
                </> : <></>}
                <View paddingTop="size-300">
                    <Switch isSelected={showTracker} onChange={v => setShowTracker(v)}>Blocks view</Switch>
                </View>
            </Form>
            <StartingValues trackListId={trackListId} trackIndex={trackIndex} />
            <Inspector trackListId={trackListId} trackIndex={trackIndex} />
        </View>
        {showTracker ? <Tracker trackListId={trackListId} trackIndex={trackIndex} /> : <TimeGrid style={{
            "backgroundColor": "var(--spectrum-gray-75)",
            // The piano roll is dark whatever the theme.
            "--playhead-line-color": "rgb(255 255 255 / 50%)",
        } as React.CSSProperties}>
            <div style={{ gridColumn: segmentIndex + 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                    <PianoRoll
                        trackListId={trackListId}
                        trackIndex={trackIndex}
                        segmentStart={segmentLengths.slice(0, segmentIndex).reduce((sum, length) => sum + length, 0)}
                    />
                </div>
                <TrackLanes trackListId={trackListId} trackIndex={trackIndex} length={segmentLengths[segmentIndex] ?? 0} />
            </div>
            <PlayheadLine />
        </TimeGrid>}
    </Grid>
}

/** How many voices the track gets, which pm64 chooses from its notes, and whether that cuts any off. */
function VoicesInfo({ trackListId, trackIndex }: { trackListId: number, trackIndex: number }) {
    const [bgm] = useBgm()
    const voices = useVoices(trackListId)
    const track = bgm?.track_lists[trackListId]?.tracks[trackIndex]
    if (!voices || !track) {
        return null
    }

    const label = <Flex width="100%" alignItems="center">
        <Text flexGrow={1}>Voices</Text>
        <ContextualHelp variant="help" placement="right">
            <Heading>Voices</Heading>
            <Content>
                <Text>
                    Each note the game plays uses a voice. A track gets a voice for each note it plays at once, up to 4, so
                    none are cut off. The game has {MAX_VOICES} voices for a segment&apos;s tracks, which sound effects
                    also use.
                </Text>
            </Content>
        </ContextualHelp>
    </Flex>

    if (track.alternate_for != null) {
        return <View>
            {label}
            <Text>Uses the voices of Track {track.alternate_for}.</Text>
        </View>
    }

    const needed = voices.needed[trackIndex]
    const given = voices.given[trackIndex]
    const segmentNeeds = total(voices.needed)
    return <View>
        {label}
        <Text>{given}</Text>
        {given < needed && <Text UNSAFE_className={styles.warning}>
            This track plays up to {needed} notes at once, but gets {given} voices, so some notes are cut off.
            Its segment needs {segmentNeeds} voices, and the game has {MAX_VOICES}.
        </Text>}
    </View>
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
                isDisabled={!canAdd}
                onPress={() => dispatch({ type: "add_alternate_part", trackLists: [trackListId], track: trackIndex })}
            >
                Add in this segment
            </ActionButton>
            <ActionButton
                isDisabled={!canAdd}
                onPress={() => dispatch({ type: "add_alternate_part", trackLists: variationTrackLists, track: trackIndex })}
            >
                Add in every segment
            </ActionButton>
            {!canAdd && <Text UNSAFE_style={{ fontSize: "0.85em" }}>No free track after this one in segment {segmentIndex + 1}.</Text>}
        </Flex>
    </View>
}
