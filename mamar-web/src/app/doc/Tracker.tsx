import { Grid, NumberField, TextField } from "@adobe/react-spectrum"
import classNames from "classnames"
import * as pm64 from "pm64-typegen"
import { ReactNode } from "react"
import { List } from "react-movable"

import styles from "./Tracker.module.scss"

import { useBgm } from "../store"

const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

function pitchToNoteName(pitch: number) {
    pitch = pitch - 104
    const octave = Math.floor(pitch / 12)
    const note = notes[pitch % 12]
    return `${note}${octave}`
}

function noteNameToPitch(noteName: string) {
    const note = noteName[0]
    const octave = parseInt(noteName[1])
    const noteIndex = notes.indexOf(note)
    return noteIndex + octave * 12 + 104
}

function Command({ command, onChange }: { command: pm64.Event, onChange: (command: pm64.Event) => void }) {
    let inner: ReactNode
    if (command.type === "Note") {
        inner = <>
            {/* FIXME */}
            <TextField
                label="Note"
                labelPosition="side"
                value={pitchToNoteName(command.pitch)}
                onChange={note => onChange({ ...command, pitch: noteNameToPitch(note) })}
                isQuiet
            />
            <NumberField
                label="Length"
                labelPosition="side"
                value={command.length}
                minValue={0}
                step={1}
                onChange={length => onChange({ ...command, length })}
                isQuiet
            />
            <NumberField
                label="Velocity"
                labelPosition="side"
                value={command.velocity}
                minValue={0}
                step={1}
                onChange={velocity => onChange({ ...command, velocity })}
                isQuiet
            />
        </>
    } else if (command.type === "Delay") {
        inner = <>
            <NumberField
                label="Length"
                labelPosition="side"
                value={command.value}
                minValue={0}
                step={1}
                onChange={value => onChange({ ...command, value })}
                isQuiet
            />
        </>
    }

    return <div
        className={styles.command}
    >
        {command.type}
        {inner}
    </div>
}

function CommandList({ commands, onMove, onChange }: {
    commands: pm64.Event[]
    onMove: (from: number, to: number) => void
    onChange: (command: pm64.Event) => void
}) {
    return <List
        values={commands}
        onChange={({ oldIndex, newIndex }) => {
            onMove(oldIndex, newIndex)
        }}
        renderList={({ children, props }) => <div {...props}>{children}</div>}
        renderItem={({ value, props, index, isDragged }) => <div
            key={value.id}
            className={classNames({
                [styles.item]: true,
                [styles.even]: ((index ?? 0) % 2) === 0,
                [styles.isDragged]: isDragged,
            })}
            {...props}
        >
            <Command command={value} onChange={onChange} />
        </div>}
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
            onChange={command => {
                dispatch({
                    type: "update_track_command",
                    trackList: trackListId,
                    track: trackIndex,
                    command,
                })
            }}
        />
    </Grid>
}
