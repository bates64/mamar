import classNames from "classnames"
import * as pm64 from "pm64-typegen"
import { ReactNode, CSSProperties, createContext, useContext } from "react"
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

import styles from "./Tracker.module.scss"

import InstrumentInput from "../InstrumentInput"
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

/**
 * Converts something like `"a" & {id: number} | {x: number, id: number}`
 * into `{a: null, id: number} | {x: number, id: number}`
 * to be more accurate to serde because the TS mappings are wrong
 */
type FixSerdeEnum<X> = X extends {id: number} & infer Str ? Str extends string ? {id: number} & {[key in Str]: null} : X : X

type DeepPartial<T> = T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>;
} : T;

function Command({ command: rawCommand }:{ command: pm64.Event }) {
    // fix rust typescript mappings
    const command = rawCommand as FixSerdeEnum<pm64.Event>

    const [, dispatch] = useBgm()
    const { trackListId, trackIndex } = useContext(trackListCtx)!
    const mutate = (partial: DeepPartial<pm64.Event>) => {
        // TODO: debounce trailing

        const newCommand: any = { ...command }
        for (const [key, value] of Object.entries(partial)) {
            if (typeof value === "object") {
                newCommand[key] = { ...newCommand[key], ...value }
            } else {
                newCommand[key] = value
            }
        }

        dispatch({
            type: "update_track_command",
            trackList: trackListId,
            track: trackIndex,
            command: newCommand as pm64.Event,
        })
    }

    if ("End" in command) {
        return <div className={classNames(styles.command)}>
            end region
        </div>
    } else if ("Delay" in command) {
        return <div className={classNames(styles.command, styles.control)}>
            wait
            <InputBox><VerticalDragNumberInput value={command.Delay} minValue={1} maxValue={999} onChange={value => mutate({ Delay: value })} /></InputBox>
            ticks
        </div>
    } else if ("Note" in command) {
        return <div className={classNames(styles.command, styles.playback)}>
            play note
            <InputBox><NoteInput pitch={command.Note.pitch} onChange={pitch => mutate({ Note: { pitch } })} /></InputBox>
            at volume
            <InputBox><VerticalDragNumberInput value={command.Note.velocity} minValue={0} maxValue={255} onChange={velocity => mutate({ Note: { velocity } })} /></InputBox>
            for
            <InputBox><VerticalDragNumberInput value={command.Note.length} minValue={1} maxValue={0xD3FF} onChange={length => mutate({ Note: { length } })} /></InputBox>
            ticks
        </div>
    } else if ("MasterTempo" in command) {
        return <div className={classNames(styles.command, styles.master)}>
            set tempo to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.MasterTempo}
                    minValue={0}
                    maxValue={0xFFFF}
                    onChange={value => mutate({ MasterTempo: value })}
                />
            </InputBox>
        </div>
    } else if ("MasterVolume" in command){
        return <div className={classNames(styles.command, styles.master)}>
            set master volume to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.MasterVolume}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={value => mutate({ MasterVolume: value })}
                />
            </InputBox>
        </div>
    } else if ("MasterPitchShift" in command) {
        return <div className={classNames(styles.command, styles.master)}>
            pitch shift master
            <InputBox>
                <VerticalDragNumberInput
                    value={command.MasterPitchShift.cent}
                    minValue={0}
                    maxValue={0xff}
                    onChange={cent => mutate({ MasterPitchShift: { cent } })}
                />
            </InputBox>
            cents
        </div>
    } else if ("UnkCmdE3" in command) {
        return <div className={classNames(styles.command, styles.master)}>
            unk command E3 effect type
            <InputBox>
                <VerticalDragNumberInput
                    value={command.UnkCmdE3.effect_type}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={effect_type => mutate({ UnkCmdE3: { effect_type } })}
                />
            </InputBox>
        </div>
    } else if ("MasterTempoFade" in command) {
        return <div className={classNames(styles.command, styles.master)}>
            fade tempo to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.MasterTempoFade.value}
                    minValue={0}
                    maxValue={0xFFFF}
                    onChange={value => mutate({ MasterTempoFade: { value } })}
                />
            </InputBox>
            over
            <InputBox>
                <VerticalDragNumberInput
                    value={command.MasterTempoFade.time}
                    minValue={0}
                    maxValue={0xFFFF}
                    onChange={time => mutate({ MasterTempoFade: { time } })}
                />
            </InputBox>
            ticks
        </div>
    } else if ("MasterVolumeFade" in command) {
        return <div className={classNames(styles.command, styles.master)}>
            fade master volume to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.MasterVolumeFade.volume}
                    minValue={0}
                    maxValue={0xFFFF}
                    onChange={volume => mutate({ MasterVolumeFade: { volume } })}
                />
            </InputBox>
            over
            <InputBox>
                <VerticalDragNumberInput
                    value={command.MasterVolumeFade.time}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={time => mutate({ MasterVolumeFade: { time } })}
                />
            </InputBox>
            ticks
        </div>
    } else if ("MasterEffect" in command) {
        // TODO: effect combobox
        return <div className={classNames(styles.command, styles.master)}>
            use room effect
            <InputBox>
                <VerticalDragNumberInput
                    value={command.MasterEffect.index}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={index => mutate({ MasterEffect: { index } })}
                />
            </InputBox>
            value
            <InputBox>
                <VerticalDragNumberInput
                    value={command.MasterEffect.value}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={value => mutate({ MasterEffect: { value } })}
                />
            </InputBox>
        </div>
    } else if ("TrackOverridePatch" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            override instrument bank
            <InputBox>
                <VerticalDragNumberInput
                    value={command.TrackOverridePatch.bank}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={bank => mutate({ TrackOverridePatch: { bank } })}
                />
            </InputBox>
            patch
            <InputBox>
                <VerticalDragNumberInput
                    value={command.TrackOverridePatch.patch}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={patch => mutate({ TrackOverridePatch: { patch } })}
                />
            </InputBox>
        </div>
    } else if ("SubTrackVolume" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            set region volume to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.SubTrackVolume}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={value => mutate({ SubTrackVolume: value })}
                />
            </InputBox>
        </div>
    } else if ("SubTrackPan" in command) {
        // TODO: bespoke input for pan value
        return <div className={classNames(styles.command, styles.track)}>
            set region pan to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.SubTrackPan}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={value => mutate({ SubTrackPan: value })}
                />
            </InputBox>
        </div>
    } else if ("SubTrackReverb" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            set region reverb to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.SubTrackReverb}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={value => mutate({ SubTrackReverb: value })}
                />
            </InputBox>
        </div>
    } else if ("SegTrackVolume" in command) {
        return <div className={classNames(styles.command, styles.seg)}>
            set volume to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.SegTrackVolume}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={value => mutate({ SegTrackVolume: value })}
                />
            </InputBox>
        </div>
    } else if ("SubTrackCoarseTune" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            set region coarse tune to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.SubTrackCoarseTune}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={value => mutate({ SubTrackCoarseTune: value })}
                />
            </InputBox>
        </div>
    } else if ("SubTrackFineTune" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            set region fine tune to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.SubTrackFineTune}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={value => mutate({ SubTrackFineTune: value })}
                />
            </InputBox>
        </div>
    } else if ("SegTrackTune" in command) {
        return <div className={classNames(styles.command, styles.seg)}>
            set pitch bend to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.SegTrackTune.bend}
                    minValue={-32768}
                    maxValue={32767}
                    onChange={bend => mutate({ SegTrackTune: { bend } })}
                />
            </InputBox>
        </div>
    } else if ("TrackTremolo" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            tremolo for
            <InputBox>
                <VerticalDragNumberInput
                    value={command.TrackTremolo.time}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={time => mutate({ TrackTremolo: { time } })}
                />
            </InputBox>
            ticks at speed
            <InputBox>
                <VerticalDragNumberInput
                    value={command.TrackTremolo.speed}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={speed => mutate({ TrackTremolo: { speed } })}
                />
            </InputBox>
            with
            <InputBox>
                <VerticalDragNumberInput
                    value={command.TrackTremolo.amount}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={amount => mutate({ TrackTremolo: { amount } })}
                />
            </InputBox>
            wobble
        </div>
    } else if ("TrackTremoloSpeed" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            set tremolo speed to
            <VerticalDragNumberInput
                value={command.TrackTremoloSpeed}
                minValue={0}
                maxValue={0xFF}
                onChange={value => mutate({ TrackTremoloSpeed: value })}
            />
        </div>
    } else if ("TrackTremoloTime" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            set tremolo duration to
            <VerticalDragNumberInput
                value={command.TrackTremoloTime.time}
                minValue={0}
                maxValue={0xFF}
                onChange={time => mutate({ TrackTremoloTime: { time } })}
            />
        </div>
    } else if ("TrackTremoloStop" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            stop tremolo
        </div>
    } else if ("UnkCmdF4" in command) {
        return <div className={styles.command}>
            unknown command F4
        </div>
    } else if ("SetTrackVoice" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            use instrument
            <InputBox>
                <InstrumentInput
                    index={command.SetTrackVoice.index}
                    onChange={index => mutate({ SetTrackVoice: { index } })}
                />
            </InputBox>
        </div>
    } else if ("TrackVolumeFade" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            fade track volume to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.TrackVolumeFade.value}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={value => mutate({ TrackVolumeFade: { value } })}
                />
            </InputBox>
            over
            <InputBox>
                <VerticalDragNumberInput
                    value={command.TrackVolumeFade.time}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={time => mutate({ TrackVolumeFade: { time } })}
                />
            </InputBox>
            ticks
        </div>
    } else if ("SubTrackReverbType" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            set region reverb type to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.SubTrackReverbType.index}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={index => mutate({ SubTrackReverbType: { index } })}
                />
            </InputBox>
        </div>
    } else if ("Jump" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            jump
            {!(command.Jump.unk_00 === 0 && command.Jump.unk_02 === 0) ? <>
                <InputBox>
                    <VerticalDragNumberInput
                        value={command.Jump.unk_00}
                        minValue={0}
                        maxValue={0xFF}
                        onChange={unk_00 => mutate({ Jump: { unk_00 } })}
                    />
                </InputBox>
                <InputBox>
                    <VerticalDragNumberInput
                        value={command.Jump.unk_02}
                        minValue={0}
                        maxValue={0xFF}
                        onChange={unk_02 => mutate({ Jump: { unk_02 } })}
                    />
                </InputBox>
            </> : null}
        </div>
    } else if ("EventTrigger" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            trigger event
            <InputBox>
                <VerticalDragNumberInput
                    value={command.EventTrigger.event_info}
                    minValue={0}
                    maxValue={0xFFFFFFFF}
                    onChange={event_info => mutate({ EventTrigger: { event_info } })}
                />
            </InputBox>
        </div>
    } else if ("Detour" in command) {
        // TODO: draggable jump arrow block like human resource machine
        return <div className={classNames(styles.command, styles.track)}>
            detour
            <InputBox>
                <StringInput
                    value={command.Detour.start_label}
                    onChange={start_label => mutate({ Detour: { start_label } })}
                />
            </InputBox>
            to
            <InputBox>
                <StringInput
                    value={command.Detour.end_label}
                    onChange={end_label => mutate({ Detour: { end_label } })}
                />
            </InputBox>
        </div>
    } else if ("UnkCmdFF" in command) {
        return <div className={styles.command}>
            unknown command FF
            0
            <InputBox>
                <VerticalDragNumberInput
                    value={command.UnkCmdFF.unk_00}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={unk_00 => mutate({ UnkCmdFF: { unk_00 } })}
                />
            </InputBox>
            1
            <InputBox>
                <VerticalDragNumberInput
                    value={command.UnkCmdFF.unk_01}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={unk_01 => mutate({ UnkCmdFF: { unk_01 } })}
                />
            </InputBox>
            2
            <VerticalDragNumberInput
                value={command.UnkCmdFF.unk_02}
                minValue={0}
                maxValue={0xFF}
                onChange={unk_02 => mutate({ UnkCmdFF: { unk_02 } })}
            />
        </div>
    } else if ("Marker" in command) {
        return <div className={styles.command}>
            jump target "
            <InputBox>
                <StringInput
                    value={command.Marker.label}
                    onChange={label => mutate({ Marker: { label } })}
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

function CommandList({ width, height }: {
    width: number
    height: number
}) {
    const [bgm] = useBgm()
    const { trackListId, trackIndex } = useContext(trackListCtx)!
    const track = bgm?.track_lists[trackListId]?.tracks[trackIndex]
    const commands: pm64.Event[] = track?.commands ?? []

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
