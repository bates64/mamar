import { Grid, View, Form, Switch, NumberField, ContextualHelp, Heading, Content, Text, Footer, Flex, RadioGroup, Radio, TextField } from "@adobe/react-spectrum"
import { useEffect, useId, useState } from "react"
import { useDebounce } from "use-debounce"

import styles from "./SubsegDetails.module.scss"
import Tracker from "./Tracker"

import { useBgm } from "../store"

export interface Props {
    trackListId: number
    trackIndex: number
}

function polyphonicIdxToVoiceCount(polyphonicIdx: number): number {
    // player->unk_22A
    switch (polyphonicIdx) {
    case 1: return 1
    case 5: return 2
    case 6: return 3
    case 7: return 4
    default: return 0
    }
}

function voiceCountToPolyphonicIdx(voiceCount: number): number {
    switch (voiceCount) {
    case 1: return 1
    case 2: return 5
    case 3: return 6
    case 4: return 7
    default: return 0
    }
}

export default function SubsegDetails({ trackListId, trackIndex }: Props) {
    const hid = useId()
    const [bgm, dispatch] = useBgm()
    const track = bgm?.trackLists[trackListId]?.tracks[trackIndex]

    // Track name editing is debounced to prevent dispatch spam when typing
    const [name, setName] = useState(track?.name)
    const [debouncedName] = useDebounce(name, 500)
    useEffect(() => {
        dispatch({ type: "modify_track_settings", trackList: trackListId, track: trackIndex, name: debouncedName })
    }, [debouncedName, dispatch, trackIndex, trackListId])

    if (!track) {
        return <div>Track not found</div>
    }

    return <Grid
        columns="auto 1fr"
        height="100%"
    >
        <View padding="size-200" borderEndColor="gray-100" borderEndWidth="thin" UNSAFE_style={{ userSelect: "none" }}>
            <h3 id={hid} className={styles.regionName}>Region Settings</h3>
            <Form maxWidth="size-2000" aria-labelledby={hid}>
                <TextField
                    label="Name"
                    value={name}
                    onChange={setName}
                />
                <Switch isSelected={!track.isDisabled} onChange={v => dispatch({ type: "modify_track_settings", trackList: trackListId, track: trackIndex, isDisabled: !v })}>Enabled</Switch>
                {trackIndex !== 0 ? <>
                    <Switch isSelected={track.isDrumTrack} onChange={isDrumTrack => dispatch({ type: "modify_track_settings", trackList: trackListId, track: trackIndex, isDrumTrack })}>Percussion</Switch>
                    <PolyphonyForm {...track} maxParentTrackIdx={trackIndex - 1} onChange={(polyphonicIdx, parentTrackIdx) => {
                        dispatch({ type: "modify_track_settings", trackList: trackListId, track: trackIndex, polyphonicIdx, parentTrackIdx })
                    }} />
                </> : <></>}
            </Form>
        </View>
        <View overflow="hidden">
            <Tracker trackListId={trackListId} trackIndex={trackIndex} />
        </View>
    </Grid>
}

function PolyphonyForm({ polyphonicIdx, parentTrackIdx, maxParentTrackIdx, onChange }: { polyphonicIdx: number, parentTrackIdx: number, maxParentTrackIdx: number, onChange: (polyphonicIdx: number, parentTrackIdx: number) => void }) {
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
        <Text flexGrow={1}>Track to take over</Text>
        <ContextualHelp variant="help" placement="right">
            <Heading>Conditional Takeover</Heading>
            <Content>
                <Text>
                    This track stays silent by default. When <code>bgm_set_variation</code> is called with
                    a non-zero variation, <b>this track performs in place of the selected track</b>, which becomes silent.
                    The takeover takes place over a 2 beat crossfade. Tracks can only take over tracks that are above them.
                </Text>
            </Content>
            <Footer>
                <Text>
                    Use takeovers to <b>swap musical parts that serve the same role</b>. For instance,
                    in <a href="https://github.com/bates64/papermario-dx/blob/main/src/world/area_sbk/sbk_56/main.c">Dry Dry Desert - S2E3 Oasis</a>,
                    two oasis-specific layers take over tracks used elsewhere in the desert.
                </Text>
            </Footer>
        </ContextualHelp>
    </Flex>

    let state = "manual"
    if (polyphonicIdx === 255) state = "auto"
    if (parentTrackIdx !== 0) state = "parent"

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
                    onChange(255, 0)
                } else if (newState === "manual") {
                    onChange(1, 0)
                } else if (newState === "parent") {
                    onChange(polyphonicIdx, Math.min(recentNonZeroParentTrackIdx, maxParentTrackIdx))
                }
            }}
        >
            <Radio value="auto">Automatic</Radio>
            <Radio value="manual">Manual</Radio>
            <Radio value="parent" isDisabled={maxParentTrackIdx <= 0}>Conditional takeover</Radio>
        </RadioGroup>
        {state === "manual" ? <NumberField
            label="Number of voices"
            value={polyphonicIdxToVoiceCount(polyphonicIdx)}
            minValue={0}
            maxValue={4}
            step={1}
            onChange={voiceCount => onChange(voiceCountToPolyphonicIdx(voiceCount), 0)}
        /> : <></>}
        {state === "parent" ? <NumberField
            label={takeoverLabel}
            description="The number of the track this one will take over when triggered."
            value={parentTrackIdx}
            minValue={1}
            maxValue={maxParentTrackIdx}
            step={1}
            onChange={parentTrackIdx => onChange(polyphonicIdx, parentTrackIdx)}
        /> : <></>}
    </View>
}
