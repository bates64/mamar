import classNames from "classnames"
import * as pm64 from "pm64-typegen"
import { ReactNode, createContext, useContext } from "react"

import { busName, effectName } from "./lanes"
import styles from "./Tracker.module.scss"

import InstrumentInput, { PatchInput } from "../InstrumentInput"
import NoteInput from "../NoteInput"
import { useBgm } from "../store"
import StringInput from "../StringInput"
import { formatVolume } from "../util/volume"
import VerticalDragNumberInput from "../VerticalDragNumberInput"

export const trackListCtx = createContext<null | { trackListId: number, trackIndex: number }>(null)

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

export function Command({ command: rawCommand }:{ command: pm64.Event }) {
    // fix rust typescript mappings
    const command = rawCommand as FixSerdeEnum<pm64.Event>

    const [, dispatch] = useBgm()
    const { trackListId, trackIndex } = useContext(trackListCtx)!
    const mutate = (command: pm64.Event | DeepPartial<pm64.Event>) => {
        dispatch({
            type: "update_track_command",
            trackList: trackListId,
            track: trackIndex,
            command: command as pm64.Event,
        })
    }

    if ("End" in command) {
        return <div className={classNames(styles.command)}>
            end region
        </div>
    } else if ("Delay" in command) {
        return <div className={classNames(styles.command, styles.control)}>
            wait
            <InputBox><VerticalDragNumberInput value={command.Delay} minValue={1} maxValue={999} onChange={value => mutate({ ...command, Delay: value })} /></InputBox>
            ticks
        </div>
    } else if ("Note" in command) {
        return <div className={classNames(styles.command, styles.playback)}>
            play note
            <InputBox><NoteInput pitch={command.Note.pitch} onChange={pitch => mutate({ ...command, Note: { ...command.Note, pitch } })} /></InputBox>
            at volume
            <InputBox><VerticalDragNumberInput value={command.Note.velocity} minValue={0} maxValue={255} onChange={velocity => mutate({ ...command, Note: { ...command.Note, velocity } })} /></InputBox>
            for
            <InputBox><VerticalDragNumberInput value={command.Note.length} minValue={1} maxValue={0xD3FF} onChange={length => mutate({ ...command, Note: { ...command.Note, length } })} /></InputBox>
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
                    onChange={value => mutate({ ...command, MasterTempo: value })}
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
                    maxValue={127}
                    onChange={value => mutate({ ...command, MasterVolume: value })}
                />
            </InputBox>
            <span className={styles.decibels}>{formatVolume(command.MasterVolume)}</span>
        </div>
    } else if ("MasterPitchShift" in command) {
        return <div className={classNames(styles.command, styles.master)}>
            transpose master by
            <InputBox>
                <VerticalDragNumberInput
                    value={command.MasterPitchShift.semitones}
                    minValue={-128}
                    maxValue={127}
                    onChange={semitones => mutate({ ...command, MasterPitchShift: { ...command.MasterPitchShift, semitones } })}
                />
            </InputBox>
            semitones
        </div>
    } else if ("BusEffect" in command) {
        return <div className={classNames(styles.command, styles.master)}>
            set main bus effect to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.BusEffect.effect_type}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={effect_type => mutate({ ...command, BusEffect: { ...command.BusEffect, effect_type } })}
                />
            </InputBox>
            ({effectName(command.BusEffect.effect_type)})
        </div>
    } else if ("MasterTempoFade" in command) {
        return <div className={classNames(styles.command, styles.master)}>
            fade tempo to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.MasterTempoFade.value}
                    minValue={0}
                    maxValue={0xFFFF}
                    onChange={value => mutate({ ...command, MasterTempoFade: { ...command.MasterTempoFade, value } })}
                />
            </InputBox>
            over
            <InputBox>
                <VerticalDragNumberInput
                    value={command.MasterTempoFade.time}
                    minValue={0}
                    maxValue={0xFFFF}
                    onChange={time => mutate({ ...command, MasterTempoFade: { ...command.MasterTempoFade, time } })}
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
                    maxValue={127}
                    onChange={volume => mutate({ ...command, MasterVolumeFade: { ...command.MasterVolumeFade, volume } })}
                />
            </InputBox>
            <span className={styles.decibels}>{formatVolume(command.MasterVolumeFade.volume)}</span>
            over
            <InputBox>
                <VerticalDragNumberInput
                    value={command.MasterVolumeFade.time}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={time => mutate({ ...command, MasterVolumeFade: { ...command.MasterVolumeFade, time } })}
                />
            </InputBox>
            ticks
        </div>
    } else if ("MasterEffect" in command) {
        return <div className={classNames(styles.command, styles.master)}>
            set effect of slot
            <InputBox>
                <VerticalDragNumberInput
                    value={command.MasterEffect.index}
                    minValue={0}
                    maxValue={3}
                    onChange={index => mutate({ ...command, MasterEffect: { ...command.MasterEffect, index } })}
                />
            </InputBox>
            ({busName(command.MasterEffect.index)}) to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.MasterEffect.value}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={value => mutate({ ...command, MasterEffect: { ...command.MasterEffect, value } })}
                />
            </InputBox>
            ({effectName(command.MasterEffect.value)})
        </div>
    } else if ("TrackOverridePatch" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            use sound
            <InputBox>
                <PatchInput
                    patch={command.TrackOverridePatch}
                    onChange={patch => mutate({ ...command, TrackOverridePatch: patch })}
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
                    maxValue={127}
                    onChange={value => mutate({ ...command, SubTrackVolume: value })}
                />
            </InputBox>
            <span className={styles.decibels}>{formatVolume(command.SubTrackVolume)}</span>
        </div>
    } else if ("SubTrackPan" in command) {
        // TODO: bespoke input for pan value
        return <div className={classNames(styles.command, styles.track)}>
            set region pan to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.SubTrackPan}
                    minValue={0}
                    maxValue={127}
                    onChange={value => mutate({ ...command, SubTrackPan: value })}
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
                    onChange={value => mutate({ ...command, SubTrackReverb: value })}
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
                    maxValue={127}
                    onChange={value => mutate({ ...command, SegTrackVolume: value })}
                />
            </InputBox>
            <span className={styles.decibels}>{formatVolume(command.SegTrackVolume)}</span>
        </div>
    } else if ("SubTrackCoarseTune" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            set region coarse tune to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.SubTrackCoarseTune}
                    minValue={-128}
                    maxValue={127}
                    onChange={value => mutate({ ...command, SubTrackCoarseTune: value })}
                />
            </InputBox>
            semitones
        </div>
    } else if ("SubTrackFineTune" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            set region fine tune to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.SubTrackFineTune}
                    minValue={-128}
                    maxValue={127}
                    onChange={value => mutate({ ...command, SubTrackFineTune: value })}
                />
            </InputBox>
            cents
        </div>
    } else if ("SegTrackTune" in command) {
        return <div className={classNames(styles.command, styles.seg)}>
            set pitch bend to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.SegTrackTune.bend}
                    minValue={-32768}
                    maxValue={32767}
                    onChange={bend => mutate({ ...command, SegTrackTune: { ...command.SegTrackTune, bend } })}
                />
            </InputBox>
        </div>
    } else if ("TrackTremolo" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            tremolo after
            <InputBox>
                <VerticalDragNumberInput
                    value={command.TrackTremolo.delay}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={delay => mutate({ ...command, TrackTremolo: { ...command.TrackTremolo, delay } })}
                />
            </InputBox>
            ticks at speed
            <InputBox>
                <VerticalDragNumberInput
                    value={command.TrackTremolo.speed}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={speed => mutate({ ...command, TrackTremolo: { ...command.TrackTremolo, speed } })}
                />
            </InputBox>
            with
            <InputBox>
                <VerticalDragNumberInput
                    value={command.TrackTremolo.depth}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={depth => mutate({ ...command, TrackTremolo: { ...command.TrackTremolo, depth } })}
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
                onChange={value => mutate({ ...command, TrackTremoloSpeed: value })}
            />
        </div>
    } else if ("TrackTremoloDepth" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            set tremolo wobble to
            <VerticalDragNumberInput
                value={command.TrackTremoloDepth.depth}
                minValue={0}
                maxValue={0xFF}
                onChange={depth => mutate({ ...command, TrackTremoloDepth: { ...command.TrackTremoloDepth, depth } })}
            />
        </div>
    } else if ("TrackTremoloStop" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            stop tremolo
        </div>
    } else if ("SubTrackRandomPan" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            pan notes randomly around
            <InputBox>
                <VerticalDragNumberInput
                    value={command.SubTrackRandomPan.pan}
                    minValue={0}
                    maxValue={127}
                    onChange={pan => mutate({ ...command, SubTrackRandomPan: { ...command.SubTrackRandomPan, pan } })}
                />
            </InputBox>
            by up to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.SubTrackRandomPan.amount}
                    minValue={0}
                    maxValue={127}
                    onChange={amount => mutate({ ...command, SubTrackRandomPan: { ...command.SubTrackRandomPan, amount } })}
                />
            </InputBox>
        </div>
    } else if ("SetTrackVoice" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            use instrument
            <InputBox>
                <InstrumentInput
                    index={command.SetTrackVoice.index}
                    onChange={index => mutate({ ...command, SetTrackVoice: { ...command.SetTrackVoice, index } })}
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
                    maxValue={127}
                    onChange={value => mutate({ ...command, TrackVolumeFade: { ...command.TrackVolumeFade, value } })}
                />
            </InputBox>
            <span className={styles.decibels}>{formatVolume(command.TrackVolumeFade.value)}</span>
            over
            <InputBox>
                <VerticalDragNumberInput
                    value={command.TrackVolumeFade.time}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={time => mutate({ ...command, TrackVolumeFade: { ...command.TrackVolumeFade, time } })}
                />
            </InputBox>
            ticks
        </div>
    } else if ("SubTrackReverbType" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            send to effect slot
            <InputBox>
                <VerticalDragNumberInput
                    value={command.SubTrackReverbType.index}
                    minValue={0}
                    maxValue={3}
                    onChange={index => mutate({ ...command, SubTrackReverbType: { ...command.SubTrackReverbType, index } })}
                />
            </InputBox>
            ({busName(command.SubTrackReverbType.index)})
        </div>
    } else if ("Branch" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            play the option for the proximity mix, from
            <BranchOptionCount branch={command.Branch.branch} />
            options
        </div>
    } else if ("EventTrigger" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            trigger event
            <InputBox>
                <VerticalDragNumberInput
                    value={command.EventTrigger.event_info}
                    minValue={0}
                    maxValue={0xFFFFFF}
                    onChange={event_info => mutate({ ...command, EventTrigger: { ...command.EventTrigger, event_info } })}
                />
            </InputBox>
        </div>
    } else if ("StereoDelay" in command) {
        return <div className={classNames(styles.command, styles.master)}>
            delay one stereo channel of effect
            <InputBox>
                <VerticalDragNumberInput
                    value={command.StereoDelay.index}
                    minValue={0}
                    maxValue={3}
                    onChange={index => mutate({ ...command, StereoDelay: { ...command.StereoDelay, index } })}
                />
            </InputBox>
            by
            <InputBox>
                <VerticalDragNumberInput
                    value={command.StereoDelay.delay}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={delay => mutate({ ...command, StereoDelay: { ...command.StereoDelay, delay } })}
                />
            </InputBox>
        </div>
    } else if ("SeekCustomEnvelope" in command) {
        return <div className={classNames(styles.command, styles.master)}>
            start writing custom envelope
            <InputBox>
                <VerticalDragNumberInput
                    value={command.SeekCustomEnvelope.index}
                    minValue={1}
                    maxValue={8}
                    onChange={index => mutate({ ...command, SeekCustomEnvelope: { ...command.SeekCustomEnvelope, index } })}
                />
            </InputBox>
        </div>
    } else if ("WriteCustomEnvelope" in command) {
        return <div className={classNames(styles.command, styles.master)}>
            add envelope step
            <InputBox>
                <VerticalDragNumberInput
                    value={command.WriteCustomEnvelope.time}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={time => mutate({ ...command, WriteCustomEnvelope: { ...command.WriteCustomEnvelope, time } })}
                />
            </InputBox>
            to
            <InputBox>
                <VerticalDragNumberInput
                    value={command.WriteCustomEnvelope.value}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={value => mutate({ ...command, WriteCustomEnvelope: { ...command.WriteCustomEnvelope, value } })}
                />
            </InputBox>
        </div>
    } else if ("UseCustomEnvelope" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            use custom envelope
            <InputBox>
                <VerticalDragNumberInput
                    value={command.UseCustomEnvelope.index}
                    minValue={0}
                    maxValue={8}
                    onChange={index => mutate({ ...command, UseCustomEnvelope: { ...command.UseCustomEnvelope, index } })}
                />
            </InputBox>
        </div>
    } else if ("TriggerSound" in command) {
        return <div className={classNames(styles.command, styles.playback)}>
            play sound effect
            <InputBox>
                <VerticalDragNumberInput
                    value={command.TriggerSound.sound}
                    minValue={0}
                    maxValue={0xFF}
                    onChange={sound => mutate({ ...command, TriggerSound: { ...command.TriggerSound, sound } })}
                />
            </InputBox>
        </div>
    } else if ("ProxMixOverride" in command) {
        return <div className={classNames(styles.command, styles.track)}>
            {command.ProxMixOverride.volume1 === 0 ? "apply proximity mix volumes" : <>
                on proximity mix, fade to
                <InputBox>
                    <VerticalDragNumberInput
                        value={command.ProxMixOverride.volume1}
                        minValue={1}
                        maxValue={0xFF}
                        onChange={volume1 => mutate({ ...command, ProxMixOverride: { ...command.ProxMixOverride, volume1 } })}
                    />
                </InputBox>
                <span className={styles.decibels}>{formatVolume(command.ProxMixOverride.volume1)}</span>
                at full mix, otherwise
                <InputBox>
                    <VerticalDragNumberInput
                        value={command.ProxMixOverride.volume2}
                        minValue={0}
                        maxValue={0xFF}
                        onChange={volume2 => mutate({ ...command, ProxMixOverride: { ...command.ProxMixOverride, volume2 } })}
                    />
                </InputBox>
                <span className={styles.decibels}>{formatVolume(command.ProxMixOverride.volume2)}</span>
            </>}
        </div>
    } else if ("Marker" in command) {
        return <div className={styles.command}>
            jump target "
            <InputBox>
                <StringInput
                    value={command.Marker.label}
                    onChange={label => mutate({ ...command, Marker: { ...command.Marker, label } })}
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

function BranchOptionCount({ branch }: { branch: number }) {
    const [bgm] = useBgm()
    return <>{bgm?.branches[branch]?.options.length ?? 0}</>
}

/** Edits the values of `command`, in track `trackIndex` of track list `trackListId`. */
export default function CommandEditor({ command, trackListId, trackIndex }: { command: pm64.Event, trackListId: number, trackIndex: number }) {
    return <trackListCtx.Provider value={{ trackListId, trackIndex }}>
        <Command command={command} />
    </trackListCtx.Provider>
}
