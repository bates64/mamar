import { Grid, View, Form, Switch, NumberField, ContextualHelp, Heading, Content, Text, Footer, Flex, RadioGroup, Radio, TextField } from "@adobe/react-spectrum"
import { Bgm, Polyphony } from "pm64-typegen"
import { useEffect, useId, useState } from "react"
import { useDebounce } from "use-debounce"

import PianoRoll from "./PianoRoll"
import styles from "./SubsegDetails.module.scss"
import TimeGrid from "./TimeGrid"
import Tracker from "./Tracker"

import { useBgm } from "../store"
import { BgmAction } from "../store/bgm"

export interface Props {
    trackListId: number
    trackIndex: number
    segmentIndex: number
}

export default function SubsegDetails({ trackListId, trackIndex, segmentIndex }: Props) {
    const hid = useId()
    const [bgm, dispatch]: [Bgm | undefined, (action: BgmAction) => void] = useBgm()
    const track = bgm?.track_lists[trackListId]?.tracks[trackIndex]

    // Track name editing is debounced to prevent dispatch spam when typing
    const [name, setName] = useState(track?.name)
    const [debouncedName] = useDebounce(name, 500)
    useEffect(() => {
        if (track?.name !== debouncedName)
            dispatch({ type: "modify_track_settings", trackList: trackListId, track: trackIndex, name: debouncedName })
    }, [debouncedName, dispatch, trackIndex, trackListId, track?.name])

    const [showTracker, setShowTracker] = useState(true)

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
                    <PolyphonyForm {...track} maxParentTrackIdx={trackIndex - 1} onChange={polyphony => {
                        dispatch({ type: "modify_track_settings", trackList: trackListId, track: trackIndex, polyphony })
                    }} />
                </> : <></>}
                <View paddingTop="size-300">
                    <Switch isSelected={showTracker} onChange={v => setShowTracker(v)}>Blocks view</Switch>
                </View>
            </Form>
        </View>
        {showTracker ? <Tracker trackListId={trackListId} trackIndex={trackIndex} /> : <TimeGrid style={{ backgroundColor: "var(--spectrum-gray-75)" }}>
            <div style={{ gridColumn: segmentIndex + 1, overflowY: "auto" }}>
                <PianoRoll trackListId={trackListId} trackIndex={trackIndex} />
            </div>
        </TimeGrid>}
    </Grid>
}

function PolyphonyForm({ polyphony, maxParentTrackIdx, onChange }: { polyphony: Polyphony, maxParentTrackIdx: number, onChange: (polyphony: Polyphony) => void }) {
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

    const takeoverLabel = <Flex width="100%" alignItems="center">
        <Text flexGrow={1}>Track to link against</Text>
        <ContextualHelp variant="help" placement="right">
            <Heading>Linking Tracks</Heading>
            <Content>
                <Text>
                    <b>This track is silent by default.</b> Call <code>bgm_set_linked_mode</code> for <b>this track to fade in to replace the selected track</b>, which becomes silent.
                    Tracks can only link with tracks that are above them.
                </Text>
            </Content>
            <Footer>
                <Text>
                    Use linked tracks to <b>swap musical parts that serve the same role</b>. For example,
                    in <a href="https://github.com/bates64/papermario-dx/blob/main/src/world/area_sbk/sbk_56/main.c">Dry Dry Desert - S2E3 Oasis</a>,
                    four oasis-specific tracks are linked to four normal tracks, and fade in when Mario is near the oasis.
                </Text>
            </Footer>
        </ContextualHelp>
    </Flex>

    let state: "auto" | "manual" | "parent" = "manual"
    let parentTrackIdx = 0
    let voiceCount = 1

    if (polyphony === "Automatic") {
        state = "auto"
    } else if ("Link" in polyphony) {
        state = "parent"
        parentTrackIdx = polyphony.Link.parent
    } else if ("Manual" in polyphony) {
        voiceCount = polyphony.Manual.voices
    }

    // Store parent track between states, e.g. so that parent->manual->parent doesn't forget which track it was
    const [recentNonZeroParentTrackIdx, setRecentNonZeroParentTrackIdx] = useState(1)
    if (parentTrackIdx !== 0 && recentNonZeroParentTrackIdx !== parentTrackIdx) {
        setRecentNonZeroParentTrackIdx(parentTrackIdx)
    }

    return <View>
        <RadioGroup
            label={polyphonyLabel}
            value={state}
            onChange={newState => {
                if (state === newState) return
                if (newState === "auto") {
                    onChange("Automatic")
                } else if (newState === "manual") {
                    onChange({
                        Manual: {
                            voices: 1,
                        },
                    })
                } else if (newState === "parent") {
                    onChange({
                        Link: {
                            parent: Math.min(recentNonZeroParentTrackIdx, maxParentTrackIdx),
                        },
                    })
                }
            }}
        >
            <Radio value="auto">Automatic</Radio>
            <Radio value="manual">Manual</Radio>
            <Radio value="parent" isDisabled={maxParentTrackIdx <= 0}>Link</Radio>
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
        {state === "parent" ? <NumberField
            label={takeoverLabel}
            description="The track this one will replace."
            value={parentTrackIdx}
            minValue={1}
            maxValue={maxParentTrackIdx}
            step={1}
            onChange={parentTrackIdx => onChange({
                Link: {
                    parent: parentTrackIdx,
                },
            })}
        /> : <></>}
    </View>
}
