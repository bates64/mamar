import * as pm64 from "pm64-typegen"
import { CSSProperties, useContext, useMemo } from "react"
import {
    Droppable,
    Draggable,
    type DroppableProvided,
    type DraggableProvided,
    type DraggableStateSnapshot,
    type DraggableRubric,
} from "react-beautiful-dnd"
import { memo } from "react-tracked"
import { FixedSizeList, areEqual } from "react-window"

import { Command, trackListCtx } from "./CommandEditor"
import styles from "./Tracker.module.scss"

import Bridge from "../bridge"
import { useBgm } from "../store"
import { useSize } from "../util/hooks/useSize"

const PADDING = 16

const ListItem = memo(({ data: commands, index, style }: { data: pm64.Event[], index: number, style: CSSProperties }) => {
    const command = commands[index]
    const lineNumberLength = commands.length.toString().length

    return <>
        <div
            className={styles.lineNumber}
            style={{
                width: lineNumberLength + "ch",
                left: Number(style.left) + PADDING,
                top: Number(style.top) + PADDING,
            }}
        >
            {(index + 1).toString().padStart(lineNumberLength, " ")}
        </div>
        <Draggable draggableId={command.id.toString()} index={index} key={command.id}>
            {(provided: DraggableProvided, _snapshot: DraggableStateSnapshot) => (
                <li
                    ref={provided.innerRef}
                    {...provided.dragHandleProps}
                    {...provided.draggableProps}
                    style={{
                        ...style,
                        ...provided.draggableProps.style,
                        width: "auto",
                        left: "calc(" + Number(style.left) + PADDING + "px + " + lineNumberLength + "ch + 8px)",
                        top: Number(style.top) + PADDING,
                    }}
                >
                    <Command command={command} />
                </li>
            )}
        </Draggable>
    </>
}, areEqual)

function CommandList({ width, height }: {
    width: number
    height: number
}) {
    const [bgm] = useBgm()
    const { trackListId, trackIndex } = useContext(trackListCtx)!
    const track = bgm?.track_lists[trackListId]?.tracks[trackIndex]
    // Detours are how songs are stored, not something to edit, so list the commands they play instead
    const commands: pm64.Event[] = useMemo(() => Bridge.commands_without_detours(track?.commands ?? []), [track?.commands])

    return <Droppable
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
                width={width}
                height={height}
                itemData={commands}
                itemCount={commands.length}
                itemSize={30}
                overscanCount={10}
                outerRef={provided.innerRef}
                innerElementType="ol"
                style={{ padding: PADDING }}
            >
                {ListItem}
            </FixedSizeList>
        )}
    </Droppable>
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
                width={container.width ?? 100}
                height={container.height ?? 100}
            />
        </trackListCtx.Provider>
    </div>
}
