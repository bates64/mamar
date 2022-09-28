import { Grid } from "@adobe/react-spectrum"
import * as pm64 from "pm64-typegen"
import { ReactNode } from "react"
import { List } from "react-movable"

import styles from "./Tracker.module.scss"

import { useBgm } from "../store"

function pitchToNoteName(pitch: number) {
    pitch = pitch - 104
    const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    const octave = Math.floor(pitch / 12)
    const note = notes[pitch % 12]
    return `${note}${octave}`
}

function Command({ command }: { command: pm64.Event }) {
    let inner: ReactNode = command.type
    if (command.type === "Note") {
        inner = <><span>{pitchToNoteName(command.pitch)}</span> <span>{command.length}</span></>
    } else if (command.type === "Delay") {
        inner = <><span>Delay</span> <span>{command.value}</span></>
    }

    return <div
        className={styles.command}
    >
        {inner}
    </div>
}

function CommandList({ commands, onMove }: { commands: pm64.Event[], onMove: (from: number, to: number) => void }) {
    return <List
        values={commands}
        onChange={({ oldIndex, newIndex }) => {
            onMove(oldIndex, newIndex)
        }}
        renderList={({ children, props }) => <div {...props}>{children}</div>}
        renderItem={({ value, props }) => <div {...props}><Command command={value} /></div>}
        removableByMove={true}
        transitionDuration={200}
    />
}

export interface Props {
    trackListId: number
    trackIndex: number
}

export default function Tracker({ trackListId, trackIndex }: Props) {
    const [bgm, dispatch] = useBgm()
    const track = bgm?.trackLists[trackListId]?.tracks[trackIndex]

    if (!track) {
        return <div>Track not found</div>
    }

    return <Grid rows="auto 1fr" gap="size-100" UNSAFE_style={{ overflow: "hidden" }}>
        <CommandList
            commands={track.commands.vec}
            onMove={(oldIndex, newIndex) => {
                dispatch({
                    type: "move_track_command",
                    trackList: trackListId,
                    track: trackIndex,
                    oldIndex,
                    newIndex,
                })
            }}
        />
    </Grid>
}
