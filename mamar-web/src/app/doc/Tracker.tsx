import * as pm64 from "pm64-typegen"
import { ReactNode, memo, CSSProperties } from "react"
import {
    Droppable,
    Draggable,
    DragDropContext,
    type DroppableProvided,
    type DraggableProvided,
    type DraggableStateSnapshot,
    type DraggableRubric,
    type DropResult,
} from "react-beautiful-dnd"
import { FixedSizeList, areEqual } from "react-window"

import styles from "./Tracker.module.scss"

import { useBgm } from "../store"
import { useSize } from "../util/hooks/useSize"

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

function Command({ command }:{ command: pm64.Event }) {
    let inner: ReactNode
    /*
    if (command.type === "Note") {
        inner = <>
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
    }*/

    /*<QuoteItem
        provided={provided}
        quote={quote}
        isDragging={snapshot.isDragging}
        isGroupedOver={Boolean(snapshot.combineTargetFor)}
        style={{ margin: 0, ...style }}
        index={index}
/>*/

    return <div>
        {command.type}
        {inner}
    </div>
}

const ListItem = memo(({ data: commands, index, style }: { data: pm64.Event[], index: number, style: CSSProperties }) => {
    const command = commands[index]

    return <Draggable draggableId={command.id.toString()} index={index} key={command.id}>
        {(provided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
            <li
                ref={provided.innerRef}
                {...provided.draggableProps}
                {...provided.dragHandleProps}
                style={{ ...style, ...provided.draggableProps.style }}
            >
                <Command command={command} />
            </li>
        )}
    </Draggable>
}, areEqual)

function CommandList({ commands, height, onMove, onChange }: {
    commands: pm64.Event[]
    height: number
    onMove: (from: number, to: number) => void
    onChange: (command: pm64.Event) => void
}) {
    function onDragEnd(result: DropResult) {
        if (!result.destination) {
            // TODO: delete?
            return
        }
        if (result.source.index === result.destination.index) {
            return
        }

        onMove(result.source.index, result.destination.index)
    }

    return <DragDropContext onDragEnd={onDragEnd}>
        <Droppable
            droppableId="droppable"
            mode="virtual"
            renderClone={(
                provided: DraggableProvided,
                snapshot: DraggableStateSnapshot,
                rubric: DraggableRubric,
            ) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                >
                    <Command command={commands[rubric.source.index]} />
                </div>
            )}
        >
            {(provided: DroppableProvided) => (
                <FixedSizeList
                    {...provided.droppableProps}
                    width={800}
                    height={height}
                    itemData={commands}
                    itemCount={commands.length}
                    itemSize={32}
                    outerRef={provided.innerRef}
                    innerElementType="ul"
                >
                    {ListItem}
                </FixedSizeList>
            )}
        </Droppable>
    </DragDropContext>
}

export interface Props {
    trackListId: number
    trackIndex: number
}

export default function Tracker({ trackListId, trackIndex }: Props) {
    const [bgm, dispatch] = useBgm()
    const track = bgm?.trackLists[trackListId]?.tracks[trackIndex]
    const container = useSize<HTMLDivElement>()

    if (!track) {
        return <div>Track not found</div>
    }

    // Mark as read
    JSON.stringify(track.commands.vec)

    return <div ref={container.ref} className={styles.container}>
        <CommandList
            height={container.height ?? 100}
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
    </div>
}
