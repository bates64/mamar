import { Grid } from "@adobe/react-spectrum"
import * as pm64 from "pm64-typegen"
import { ReactNode, useMemo } from "react"

import styles from "./Sequencer.module.scss"

import { useBgm } from "../store"
import useSelection, { SelectionProvider } from "../util/hooks/useSelection"

function pitchToNoteName(pitch: number) {
    pitch = pitch - 104
    const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    const octave = Math.floor(pitch / 12)
    const note = notes[pitch % 12]
    return `${note}${octave}`
}

function Command({ command }: { command: pm64.Event }) {
    const selection = useSelection()

    let inner: ReactNode = command.type
    if (command.type === "Note") {
        inner = <><span>{pitchToNoteName(command.pitch)}</span> <span>{command.length}</span></>
    } else if (command.type === "Delay") {
        inner = <><span>Delay</span> <span>{command.value}</span></>
    }

    return <div
        className={styles.command}
        aria-selected={selection.isSelected(command.id)}
        onClick={evt => {
            if (evt.shiftKey) {
                selection.multiSelect(command.id)
            } else {
                selection.select(command.id)
            }
            evt.stopPropagation()
        }}
    >
        {inner}
    </div>
}

function Track({ idx, track }: { idx: number, track: pm64.Track }) {
    const selection = useSelection()

    return <div className={styles.track}>
        <h4
            className={styles.trackName}
            onClick={evt => {
                if (evt.shiftKey) {
                    for (const { id } of track.commands.vec) {
                        if (!selection.isSelected(id)) {
                            selection.multiSelect(id)
                        }
                    }
                } else {
                    selection.select(...track.commands.vec.map(cmd => cmd.id))
                }
                evt.stopPropagation()
            }}
        >
            Track {idx + 1}
        </h4>
        <ol className={styles.commandList}>
            {track.commands.vec.map(command => <li key={command.id}>
                <Command command={command} />
            </li>)}
        </ol>
    </div>
}

function TrackList({ trackList }: { trackList: pm64.TrackList }) {
    const selection = useSelection()

    return <div
        className={styles.trackList}
        onClick={() => {
            selection.clear()
        }}
    >
        <Grid columns="repeat(16, 1fr)" gap="size-100">
            {trackList.tracks.map((track, i) => <Track key={i} idx={i} track={track} />)}
        </Grid>
    </div>
}

function SelectedCommandView({ trackList }: { trackList: pm64.TrackList }) {
    const { selected } = useSelection()
    const commandId = selected[0] ?? null
    const command = useMemo(() => {
        if (commandId === null) {
            return null
        }

        for (const track of trackList.tracks) {
            for (const cmd of track.commands.vec) {
                if (cmd.id === commandId) {
                    return cmd
                }
            }
        }

        return null
    }, [commandId, trackList.tracks])

    if (!command || selected.length !== 1) {
        return <div>
            {selected.length} commands selected
        </div>
    } else {
        return <div>
            Selected: <code>{JSON.stringify(command)}</code>
        </div>
    }
}

export interface Props {
    trackListId: number
}

export default function Sequencer({ trackListId }: Props) {
    const [bgm] = useBgm()
    const trackList = bgm?.trackLists[trackListId]

    if (!trackList) {
        return <div>Track list {trackListId} not found</div>
    }

    return <SelectionProvider>
        <Grid rows="auto 1fr" gap="size-100">
            <SelectedCommandView trackList={trackList} />
            <TrackList trackList={trackList} />
        </Grid>
    </SelectionProvider>
}
