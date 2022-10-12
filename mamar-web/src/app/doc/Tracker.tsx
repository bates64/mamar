import classNames from "classnames"
import * as pm64 from "pm64-typegen"
import { ReactNode, CSSProperties, createContext, useContext } from "react"
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
import { memo } from "react-tracked"
import { FixedSizeList, areEqual } from "react-window"

import styles from "./Tracker.module.scss"

import { useBgm } from "../store"
import { useSize } from "../util/hooks/useSize"
import VerticalDragNumberInput from "../VerticalDragNumberInput"

const trackListCtx = createContext<null | { trackListId: number, trackIndex: number }>(null)

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

function InputBox({ children }: { children: ReactNode }) {
    return <span className={styles.inputBox}>
        {children}
    </span>
}

function Command({ command }:{ command: pm64.Event }) {
    const [bgm, dispatch] = useBgm()
    const { trackListId, trackIndex } = useContext(trackListCtx)!
    const mutate = (partial: Partial<pm64.Event>) => {
        // TODO: debounce

        dispatch({
            type: "update_track_command",
            trackList: trackListId,
            track: trackIndex,
            command: { ...command, ...partial } as pm64.Event,
        })
    }

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

    if (command.type === "Delay") {
        return <div className={classNames(styles.command, styles.orange)}>
            wait <InputBox><VerticalDragNumberInput value={command.value} minValue={1} maxValue={999} onChange={value => mutate({ value })} /></InputBox> ticks
        </div>
    } else if (command.type === "Note") {
        return <div className={classNames(styles.command, styles.purple)}>
            play note <InputBox><input type="number" value={command.pitch} onChange={evt => mutate({ pitch: +evt.target.value })} /></InputBox>
            for <InputBox><VerticalDragNumberInput value={command.length} minValue={1} maxValue={0xD3FF} onChange={value => mutate({ length: value })} /></InputBox> ticks
        </div>
    }

    return <div>
        {command.type}
        {inner}
    </div>
}

const ListItem = memo(({ data: commands, index, style }: { data: pm64.Event[], index: number, style: CSSProperties }) => {
    const command = commands[index]

    return <Draggable draggableId={command.id.toString()} index={index} key={command.id}>
        {(provided: DraggableProvided, _snapshot: DraggableStateSnapshot) => (
            <li
                ref={provided.innerRef}
                {...provided.draggableProps}
                {...provided.dragHandleProps}
                style={{ ...style, ...provided.draggableProps.style, width: "auto" }}
            >
                <Command command={command} />
            </li>
        )}
    </Draggable>
}, areEqual)

function CommandList({ height }: {
    height: number
}) {
    const [bgm, dispatch] = useBgm()
    const { trackListId, trackIndex } = useContext(trackListCtx)!
    const track = bgm?.trackLists[trackListId]?.tracks[trackIndex]
    const commands = track?.commands?.vec ?? []

    function onDragEnd(result: DropResult) {
        if (!result.destination) {
            // TODO: delete?
            return
        }
        if (result.source.index === result.destination.index) {
            return
        }

        dispatch({
            type: "move_track_command",
            trackList: trackListId,
            track: trackIndex,
            oldIndex: result.source.index,
            newIndex: result.destination.index,
        })
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
                    itemSize={24}
                    overscanCount={10}
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
    const container = useSize<HTMLDivElement>()

    return <div ref={container.ref} className={styles.container}>
        <trackListCtx.Provider value={{ trackListId, trackIndex }}>
            <CommandList
                height={container.height ?? 100}
            />
        </trackListCtx.Provider>
    </div>
}
