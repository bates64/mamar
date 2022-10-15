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

import NoteInput from "../NoteInput"
import { useBgm } from "../store"
import StringInput from "../StringInput"
import { useSize } from "../util/hooks/useSize"
import VerticalDragNumberInput from "../VerticalDragNumberInput"

const trackListCtx = createContext<null | { trackListId: number, trackIndex: number }>(null)

const PADDING = 16

function InputBox({ children }: { children: ReactNode }) {
    return <span className={styles.inputBox}>
        {children}
    </span>
}

function Command({ command }:{ command: pm64.Event }) {
    const [, dispatch] = useBgm()
    const { trackListId, trackIndex } = useContext(trackListCtx)!
    const mutate = (partial: Partial<pm64.Event>) => {
        // TODO: debounce trailing

        dispatch({
            type: "update_track_command",
            trackList: trackListId,
            track: trackIndex,
            command: { ...command, ...partial } as pm64.Event,
        })
    }

    if (command.type === "End") {
        return <div className={classNames(styles.command)}>
            end region
        </div>
    } else if (command.type === "Delay") {
        return <div className={classNames(styles.command, styles.control)}>
            wait
            <InputBox><VerticalDragNumberInput value={command.value} minValue={1} maxValue={999} onChange={value => mutate({ value })} /></InputBox>
            ticks
        </div>
    } else if (command.type === "Note") {
        return <div className={classNames(styles.command, styles.playback)}>
            play note
            <InputBox><NoteInput pitch={command.pitch} onChange={pitch => mutate({ pitch })} /></InputBox>
            at volume
            <InputBox><VerticalDragNumberInput value={command.velocity} minValue={0} maxValue={255} onChange={velocity => mutate({ velocity })} /></InputBox>
            for
            <InputBox><VerticalDragNumberInput value={command.length} minValue={1} maxValue={0xD3FF} onChange={length => mutate({ length })} /></InputBox>
            ticks
        </div>
    } else if (command.type === "MasterTempo") {
        return <div className={classNames(styles.command, styles.master)}>
            set tempo to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.value}
                    minValue={0}
                    maxValue={0xFFFF}
                    onChange={value => mutate({ value })}
                />
            </InputBox>
        </div>
    } else if (command.type === "MasterVolume"){
        return <div className={classNames(styles.command, styles.master)}>
            set master volume to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.value}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={value => mutate({ value })}
                />
            </InputBox>
        </div>
    } else if (command.type === "MasterPitchShift") {
        return <div className={classNames(styles.command, styles.master)}>
            pitch shift master
            <InputBox>
                <VerticalDragNumberInput
                    value={command.cent}
                    minValue={0}
                    maxValue={0xff}
                    onChange={cent => mutate({ cent })}
                />
            </InputBox>
            cents
        </div>
    } else if (command.type === "UnkCmdE3") {
        return <div className={classNames(styles.command, styles.master)}>
            unk command E3 bank
            <InputBox>
                <VerticalDragNumberInput
                    value={command.bank}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={bank => mutate({ bank })}
                />
            </InputBox>
        </div>
    } else if (command.type === "MasterTempoFade") {
        return <div className={classNames(styles.command, styles.master)}>
            fade tempo to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.value}
                    minValue={0}
                    maxValue={0xFFFF}
                    onChange={value => mutate({ value })}
                />
            </InputBox>
            over
            <InputBox>
                <VerticalDragNumberInput
                    value={command.time}
                    minValue={0}
                    maxValue={0xFFFF}
                    onChange={time => mutate({ time })}
                />
            </InputBox>
            ticks
        </div>
    } else if (command.type === "MasterVolumeFade") {
        return <div className={classNames(styles.command, styles.master)}>
            fade master volume to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.volume}
                    minValue={0}
                    maxValue={0xFFFF}
                    onChange={volume => mutate({ volume })}
                />
            </InputBox>
            over
            <InputBox>
                <VerticalDragNumberInput
                    value={command.time}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={time => mutate({ time })}
                />
            </InputBox>
            ticks
        </div>
    } else if (command.type === "MasterEffect") {
        // TODO: effect combobox
        return <div className={classNames(styles.command, styles.master)}>
            use room effect
            <InputBox>
                <VerticalDragNumberInput
                    value={command.index}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={index => mutate({ index })}
                />
            </InputBox>
            value
            <InputBox>
                <VerticalDragNumberInput
                    value={command.value}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={value => mutate({ value })}
                />
            </InputBox>
        </div>
    } else if (command.type === "TrackOverridePatch") {
        return <div className={classNames(styles.command, styles.track)}>
            override instrument bank
            <InputBox>
                <VerticalDragNumberInput
                    value={command.bank}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={bank => mutate({ bank })}
                />
            </InputBox>
            patch
            <InputBox>
                <VerticalDragNumberInput
                    value={command.patch}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={patch => mutate({ patch })}
                />
            </InputBox>
        </div>
    } else if (command.type === "SubTrackVolume") {
        return <div className={classNames(styles.command, styles.track)}>
            set region volume to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.value}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={value => mutate({ value })}
                />
            </InputBox>
        </div>
    } else if (command.type === "SubTrackPan") {
        // TODO: bespoke input for pan value
        return <div className={classNames(styles.command, styles.track)}>
            set region pan to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.value}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={value => mutate({ value })}
                />
            </InputBox>
        </div>
    } else if (command.type === "SubTrackReverb") {
        return <div className={classNames(styles.command, styles.track)}>
            set region reverb to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.value}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={value => mutate({ value })}
                />
            </InputBox>
        </div>
    } else if (command.type === "SegTrackVolume") {
        return <div className={classNames(styles.command, styles.seg)}>
            set volume to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.value}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={value => mutate({ value })}
                />
            </InputBox>
        </div>
    } else if (command.type === "SubTrackCoarseTune") {
        return <div className={classNames(styles.command, styles.track)}>
            set region coarse tune to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.value}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={value => mutate({ value })}
                />
            </InputBox>
        </div>
    } else if (command.type === "SubTrackFineTune") {
        return <div className={classNames(styles.command, styles.track)}>
            set region fine tune to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.value}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={value => mutate({ value })}
                />
            </InputBox>
        </div>
    } else if (command.type === "SegTrackTune") {
        return <div className={classNames(styles.command, styles.seg)}>
            set course tune to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.coarse}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={coarse => mutate({ coarse })}
                />
            </InputBox>
            and fine tune to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.fine}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={fine => mutate({ fine })}
                />
            </InputBox>
        </div>
    } else if (command.type === "TrackTremolo") {
        return <div className={classNames(styles.command, styles.track)}>
            tremolo for
            <InputBox>
                <VerticalDragNumberInput
                    value={command.time}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={time => mutate({ time })}
                />
            </InputBox>
            ticks at speed
            <InputBox>
                <VerticalDragNumberInput
                    value={command.speed}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={speed => mutate({ speed })}
                />
            </InputBox>
            with
            <InputBox>
                <VerticalDragNumberInput
                    value={command.amount}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={amount => mutate({ amount })}
                />
            </InputBox>
            wobble
        </div>
    } else if (command.type === "TrackTremoloSpeed") {
        return <div className={classNames(styles.command, styles.track)}>
            set tremolo speed to
            <VerticalDragNumberInput
                value={command.value}
                minValue={0}
                maxValue={0xFF}
                onChange={value => mutate({ value })}
            />
        </div>
    } else if (command.type === "TrackTremoloTime") {
        return <div className={classNames(styles.command, styles.track)}>
            set tremolo duration to
            <VerticalDragNumberInput
                value={command.time}
                minValue={0}
                maxValue={0xFF}
                onChange={time => mutate({ time })}
            />
        </div>
    } else if (command.type === "TrackTremoloStop") {
        return <div className={classNames(styles.command, styles.track)}>
            stop tremolo
        </div>
    } else if (command.type === "UnkCmdF4") {
        return <div className={styles.command}>
            unknown command F4
        </div>
    } else if (command.type === "SetTrackVoice") {
        // TODO: bespoke ui
        return <div className={classNames(styles.command, styles.track)}>
            set track instrument
            <InputBox>
                <VerticalDragNumberInput
                    value={command.index}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={index => mutate({ index })}
                />
            </InputBox>
        </div>
    } else if (command.type === "TrackVolumeFade") {
        return <div className={classNames(styles.command, styles.track)}>
            fade track volume to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.value}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={value => mutate({ value })}
                />
            </InputBox>
            over
            <InputBox>
                <VerticalDragNumberInput
                    value={command.time}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={time => mutate({ time })}
                />
            </InputBox>
            ticks
        </div>
    } else if (command.type === "SubTrackReverbType") {
        return <div className={classNames(styles.command, styles.track)}>
            set region reverb type to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.index}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={index => mutate({ index })}
                />
            </InputBox>
        </div>
    } else if (command.type === "Jump") {
        return <div className={classNames(styles.command, styles.track)}>
            jump
            {!(command.unk_00 === 0 && command.unk_02 === 0) ? <>
                <InputBox>
                    <VerticalDragNumberInput
                        value={command.unk_00}
                        minValue={0}
                        maxValue={0xFF}
                        onChange={unk_00 => mutate({ unk_00 })}
                    />
                </InputBox>
                <InputBox>
                    <VerticalDragNumberInput
                        value={command.unk_02}
                        minValue={0}
                        maxValue={0xFF}
                        onChange={unk_02 => mutate({ unk_02 })}
                    />
                </InputBox>
            </> : null}
        </div>
    } else if (command.type === "EventTrigger") {
        return <div className={classNames(styles.command, styles.track)}>
            trigger event
            <InputBox>
                <VerticalDragNumberInput
                    value={command.event_info}
                    minValue={0}
                    maxValue={0xFFFFFFFF}
                    onChange={event_info => mutate({ event_info })}
                />
            </InputBox>
        </div>
    } else if (command.type === "Detour") {
        // TODO: draggable jump arrow block like human resource machine
        return <div className={classNames(styles.command, styles.track)}>
            detour
            <InputBox>
                <StringInput
                    value={command.start_label}
                    onChange={start_label => mutate({ start_label })}
                />
            </InputBox>
            to
            <InputBox>
                <StringInput
                    value={command.end_label}
                    onChange={end_label => mutate({ end_label })}
                />
            </InputBox>
        </div>
    } else if (command.type === "UnkCmdFF") {
        return <div className={styles.command}>
            unknown command FF
            0
            <InputBox>
                <VerticalDragNumberInput
                    value={command.unk_00}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={unk_00 => mutate({ unk_00 })}
                />
            </InputBox>
            1
            <InputBox>
                <VerticalDragNumberInput
                    value={command.unk_01}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={unk_01 => mutate({ unk_01 })}
                />
            </InputBox>
            2
            <VerticalDragNumberInput
                value={command.unk_02}
                minValue={0}
                maxValue={0xFF}
                onChange={unk_02 => mutate({ unk_02 })}
            />
        </div>
    } else if (command.type === "Marker") {
        return <div className={styles.command}>
            jump target "
            <InputBox>
                <StringInput
                    value={command.label}
                    onChange={label => mutate({ label })}
                />
            </InputBox>
            "
        </div>
    } else {
        // This is unreachable (typeof command.type = never) but just in case...
        return <div className={styles.command}>
            unknown command
        </div>
    }
}

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
                    className={styles.dragging}
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
                    itemSize={27}
                    overscanCount={10}
                    outerRef={provided.innerRef}
                    innerElementType="ul"
                    style={{ padding: PADDING }}
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
