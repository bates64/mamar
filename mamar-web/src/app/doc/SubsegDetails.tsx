import { Grid, View, Form, Switch, NumberField } from "@adobe/react-spectrum"
import { useId } from "react"

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

    return <Grid
        columns="1fr auto"
        height="100%"
    >
        <View padding="size-200" borderEndColor="gray-200" borderEndWidth="thin">
            <h3 id={hid}>Region {trackListId}.{trackIndex}</h3>
            <Form minWidth="size-2000" aria-labelledby={hid}>
                <Switch isSelected={track.isDisabled} onChange={isDisabled => dispatch({ type: "modify_track_settings", trackList: trackListId, track: trackIndex, isDisabled })}>Disable</Switch>
                <Switch isSelected={track.isDrumTrack} onChange={isDrumTrack => dispatch({ type: "modify_track_settings", trackList: trackListId, track: trackIndex, isDrumTrack })}>Percussion</Switch>
                <NumberField
                    label="Polyhony"
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
        <View overflow="overlay">
            <Tracker trackListId={trackListId} trackIndex={trackIndex} />
        </View>
    </Grid>
}