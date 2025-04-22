import { Grid, View, Form, Switch, NumberField, ContextualHelp, Heading, Content, Text, Footer, Flex } from "@adobe/react-spectrum"
import { useId } from "react"

import styles from "./SubsegDetails.module.scss"
import Tracker from "./Tracker"

import { useBgm } from "../store"

export interface Props {
    trackListId: number
    trackIndex: number
}

export default function SubsegDetails({ trackListId, trackIndex }: Props) {
    const hid = useId()
    const [bgm, dispatch] = useBgm()
    const track = bgm?.trackLists[trackListId]?.tracks[trackIndex]

    if (!track) {
        return <div>Track not found</div>
    }

    const polyphonyLabel = <Flex width="100%" alignItems="center">
        <Text flexGrow={1}>Polyphony priority</Text>
        <ContextualHelp variant="help">
            <Heading>What is polyphony?</Heading>
            <Content>
                <Text>
                    The game engine can play up to 24 notes or sound effects at the same time. If this region tries to
                    play a note but there are too many playing, <b>regions with higher polyphony priority will steal
                    from lower or equal priority regions</b>.
                </Text>
            </Content>
            <Footer>
                Use a high priority for leads or prominent instruments. If this region plays more than one note at once, you must use a value of 5 or above.
            </Footer>
        </ContextualHelp>
    </Flex>

    return <Grid
        columns="auto 1fr"
        height="100%"
    >
        <View padding="size-200" borderEndColor="gray-100" borderEndWidth="thin" UNSAFE_style={{ userSelect: "none" }}>
            <h3 id={hid} className={styles.regionName}>Region {trackListId}.{trackIndex}</h3>
            <Form maxWidth="size-2000" aria-labelledby={hid}>
                <Switch isSelected={!track.isDisabled} onChange={v => dispatch({ type: "modify_track_settings", trackList: trackListId, track: trackIndex, isDisabled: !v })}>Enabled</Switch>
                <Switch isSelected={track.isDrumTrack} onChange={isDrumTrack => dispatch({ type: "modify_track_settings", trackList: trackListId, track: trackIndex, isDrumTrack })}>Percussion</Switch>
                <NumberField
                    label={polyphonyLabel}
                    value={track.polyphonicIdx}
                    minValue={0}
                    maxValue={255}
                    step={1}
                    onChange={polyphonicIdx => dispatch({ type: "modify_track_settings", trackList: trackListId, track: trackIndex, polyphonicIdx })}
                />
                <NumberField
                    label="Parent track"
                    value={track.parentTrackIdx + 1}
                    minValue={1}
                    maxValue={Math.max(1, trackIndex)}
                    step={1}
                    onChange={parentTrackIdx => dispatch({ type: "modify_track_settings", trackList: trackListId, track: trackIndex, parentTrackIdx: parentTrackIdx - 1 })}
                />
            </Form>
        </View>
        <View overflow="hidden">
            <Tracker trackListId={trackListId} trackIndex={trackIndex} />
        </View>
    </Grid>
}
