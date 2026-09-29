import { ActionButton, Grid, View, Form, Switch, NumberField, ContextualHelp, Heading, Content, Text, Footer, Flex, RadioGroup, Radio, TextField } from "@adobe/react-spectrum"
import { Bgm, Polyphony } from "pm64-typegen"
import { useEffect, useId, useState } from "react"
import { useDebounce } from "use-debounce"

import Inspector from "./Inspector"
import LaneMenu from "./LaneMenu"
import PianoRoll from "./PianoRoll"
import { PlayheadLine } from "./Playhead"
import { useSegmentLengths } from "./Ruler"
import styles from "./SubsegDetails.module.scss"
import TimeGrid from "./TimeGrid"
import Tracker from "./Tracker"
import TrackLanes, { useTrackLanes } from "./TrackLanes"

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
        <View padding="size-200" borderEndColor="gray-100" borderEndWidth="thin" UNSAFE_style={{ userSelect: "none" }}>
            <h3 id={hid} className={styles.regionName}>Region Settings</h3>
            <Form maxWidth="size-2000" aria-labelledby={hid} onSubmit={e => e.preventDefault()}>
                <TextField
                    label="Name"
                    value={name}
                    onChange={setName}
                />
                <Switch isSelected={!track.is_disabled} onChange={v => dispatch({ type: "modify_track_settings", trackList: trackListId, track: trackIndex, isDisabled: !v })}>Enabled</Switch>
                {trackIndex !== 0 ? <>
                    <Switch isSelected={track.is_drum_track} onChange={isDrumTrack => dispatch({ type: "modify_track_settings", trackList: trackListId, track: trackIndex, isDrumTrack })}>Percussion</Switch>
                    {track.alternate_for == null && <PolyphonyForm polyphony={track.polyphony} onChange={polyphony => {
                        dispatch({ type: "modify_track_settings", trackList: trackListId, track: trackIndex, polyphony })
                    }} />}
                    <AlternatePartForm trackListId={trackListId} trackIndex={mainIndex} segmentIndex={segmentIndex} />
                </> : <></>}
                <View paddingTop="size-300">
                    <Switch isSelected={showTracker} onChange={v => setShowTracker(v)}>Blocks view</Switch>
                </View>
            </Form>
            <TrackLaneMenu trackListId={trackListId} trackIndex={trackIndex} />
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

function TrackLaneMenu({ trackListId, trackIndex }: { trackListId: number, trackIndex: number }) {
    const { options } = useTrackLanes(trackListId, trackIndex)
    return <View paddingTop="size-100">
        <LaneMenu lanes={options} />
    </View>
}

function PolyphonyForm({ polyphony, onChange }: { polyphony: Polyphony, onChange: (polyphony: Polyphony) => void }) {
    const polyphonyLabel = <Flex width="100%" alignItems="center">
        <Text flexGrow={1}>Polyphony</Text>
        <ContextualHelp variant="help" placement="right">
            <Heading>Understanding Polyphony</Heading>
            <Content>
                <Text>
                    Polyphony controls <b>how many notes a region can play at the same time</b>.
                    Each note requires a voice.
                    For example, if a region has <i>1 voice</i>, playing a new note will cut off any held one.
                </Text>
            </Content>
            <Footer>
                <Text>
                    The game can run up to 24 voices at once. If there are too many notes playing, regions with higher voice counts
                    might stop shorter notes in <i>other</i> regions to keep things running smoothly.
                </Text>
            </Footer>
        </ContextualHelp>
    </Flex>

    const state = polyphony === "Automatic" ? "auto" : "manual"
    const voiceCount = typeof polyphony === "object" && "Manual" in polyphony ? polyphony.Manual.voices : 1

    return <View>
        <RadioGroup
            label={polyphonyLabel}
            value={state}
            onChange={newState => {
                if (state === newState) return
                if (newState === "auto") {
                    onChange("Automatic")
                } else {
                    onChange({
                        Manual: {
                            voices: 1,
                        },
                    })
                }
            }}
        >
            <Radio value="auto">Automatic</Radio>
            <Radio value="manual">Manual</Radio>
        </RadioGroup>
        {state === "manual" ? <NumberField
            label="Number of voices"
            value={voiceCount}
            minValue={0}
            maxValue={4}
            step={1}
            onChange={voices => onChange({
                Manual: {
                    voices,
                },
            })}
        /> : <></>}
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
