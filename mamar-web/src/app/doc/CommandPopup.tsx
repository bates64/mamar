import { Flex, NumberField, Text, TextField } from "@adobe/react-spectrum"
import { Event } from "pm64-typegen"

import styles from "./CommandPopup.module.scss"
import { EnvelopeSelect, SampleSelect } from "./InstrumentEditor"
import { commandName, formatBeats, formatPan, formatRandomPan, formatTremoloDepth, formatTremoloSpeed } from "./lanes"
import { TICKS_PER_BEAT } from "./Ruler"
import { toEvent } from "./useLaneEditing"
import ValueSlider from "./ValueSlider"

import { useBgm } from "../store"
import { formatVolume } from "../util/volume"

type Value = number | string | { [key: string]: Value }

interface Field {
    /** Path to the value within the command's fields. An empty path is the command's own value. */
    path: string[]
    label: string
    min?: number
    max?: number
    hex?: boolean
    /** How a value that's dragged to, rather than typed, is shown, such as a volume in decibels. */
    format?(value: number): string
}

const volume = (path: string[], label = "Volume", max = 127): Field => ({ path, label, min: 0, max, format: formatVolume })
const fadeTime: Field = { path: ["time"], label: "Fade time (ticks)", min: 0, max: 0xFFFF }

/** The fields to edit for each kind of command. Others edit every number in the command. */
const FIELDS: Record<string, Field[]> = {
    EventTrigger: [{ path: ["event_info"], label: "Event", min: 0, max: 0xFFFFFF, hex: true }],
    TriggerSound: [{ path: ["sound"], label: "Sound effect", min: 0, max: 255 }],
    MasterTempo: [{ path: [], label: "Tempo (BPM)", min: 1, max: 0xFFFF }],
    MasterTempoFade: [{ path: ["value"], label: "Tempo (BPM)", min: 1, max: 0xFFFF }, fadeTime],
    MasterPitchShift: [{ path: ["semitones"], label: "Transpose (semitones)", min: -128, max: 127 }],
    MasterVolume: [volume([])],
    MasterVolumeFade: [volume(["volume"]), fadeTime],
    SubTrackVolume: [volume([])],
    SegTrackVolume: [volume([], "Track volume")],
    TrackVolumeFade: [volume(["value"]), fadeTime],
    SubTrackPan: [{ path: [], label: "Pan", min: 0, max: 127, format: formatPan }],
    SubTrackReverb: [{ path: [], label: "Reverb", min: 0, max: 127, format: String }],
    TrackTremolo: [
        { path: ["depth"], label: "Depth", min: 0, max: 127, format: formatTremoloDepth },
        { path: ["speed"], label: "Speed", min: 0, max: 64, format: formatTremoloSpeed },
        { path: ["delay"], label: "Delay", min: 0, max: TICKS_PER_BEAT * 4, format: formatBeats },
    ],
    TrackTremoloDepth: [{ path: ["depth"], label: "Tremolo depth", min: 0, max: 127, format: formatTremoloDepth }],
    TrackTremoloSpeed: [{ path: [], label: "Tremolo speed", min: 0, max: 64, format: formatTremoloSpeed }],
    SubTrackRandomPan: [
        { path: ["pan"], label: "Pan", min: 0, max: 127, format: formatPan },
        { path: ["amount"], label: "Random pan", min: 0, max: 127, format: formatRandomPan },
    ],
    SubTrackCoarseTune: [{ path: [], label: "Tune (semitones)", min: -128, max: 127 }],
    SubTrackFineTune: [{ path: [], label: "Fine tune (cents)", min: -128, max: 127 }],
    SegTrackTune: [{ path: ["bend"], label: "Pitch bend (cents)", min: -0x8000, max: 0x7FFF }],
    TrackOverridePatch: [],
    SeekCustomEnvelope: [{ path: ["index"], label: "Custom envelope to write", min: 1, max: 8 }],
    WriteCustomEnvelope: [
        { path: ["time"], label: "Time, or envelope command from 40", min: 0, max: 255 },
        { path: ["value"], label: "Value", min: 0, max: 255 },
    ],
    UseCustomEnvelope: [{ path: ["index"], label: "Custom envelope (0 for the instrument's)", min: 0, max: 8 }],
    StereoDelay: [
        { path: ["index"], label: "Effect slot", min: 0, max: 1 },
        { path: ["delay"], label: "Delay (0 turns it off)", min: 0, max: 255 },
    ],
    ProxMixOverride: [
        { ...volume(["volume1"], "Volume when Mario is at a mix's place", 255), min: 1 },
        volume(["volume2"], "Volume away from it", 255),
    ],
    Marker: [{ path: ["label"], label: "Label" }],
}

function humanize(key: string): string {
    const words = key.replace(/_/g, " ")
    return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Fields for every number in `value`, for commands without their own list. */
function numberFields(value: Value, path: string[] = []): Field[] {
    if (typeof value === "number") {
        return [{ path, label: path.length > 0 ? humanize(path[path.length - 1]) : "Value" }]
    } else if (typeof value === "object" && value !== null) {
        return Object.entries(value).flatMap(([key, inner]) => numberFields(inner, [...path, key]))
    }
    return []
}

function get(value: Value, path: string[]): Value {
    return path.reduce<Value>((inner, key) => (inner as Record<string, Value>)[key], value)
}

function set(value: Value, path: string[], newValue: Value): Value {
    if (path.length === 0) {
        return newValue
    }
    const [key, ...rest] = path
    const object = value as Record<string, Value>
    return { ...object, [key]: set(object[key], rest, newValue) }
}

/** A popup that edits `event`, in track `trackIndex` of track list `trackListId`. */
export default function CommandPopup({ event, trackListId, trackIndex }: { event: Event, trackListId: number, trackIndex: number }) {
    const [bgm, dispatch] = useBgm()
    const fields = event as unknown as Record<string, Value>
    const variant = Object.keys(fields).find(key => key !== "id")!
    const value = fields[variant]

    const update = (path: string[], newValue: Value) => {
        const command = { [variant]: set(value, path, newValue) }
        dispatch({ type: "update_track_command", trackList: trackListId, track: trackIndex, command: toEvent(command as never, event.id) })
    }

    let body
    if (variant === "Branch") {
        const branch = bgm?.branches[(value as { branch: number }).branch]
        body = <Text>Plays one of {branch?.options.length ?? 0} passages, chosen by the mix.</Text>
    } else {
        const shown = FIELDS[variant] ?? numberFields(value)
        body = <Flex direction="column" gap="size-100">
            {variant === "TrackOverridePatch" && <>
                <SampleSelect patch={value as never} onChange={patch => update([], patch as never)} />
                <EnvelopeSelect patch={value as never} onChange={patch => update([], patch as never)} />
            </>}
            {shown.map(field => {
                const current = get(value, field.path)
                const key = field.path.join(".") || "value"
                if (field.format) {
                    return <ValueSlider
                        key={key}
                        label={field.label}
                        value={current as number}
                        min={field.min ?? 0}
                        max={field.max ?? 127}
                        format={field.format}
                        fillOffset={field.format === formatPan ? 64 : undefined}
                        onChange={value => update(field.path, value)}
                    />
                } else if (typeof current === "string") {
                    return <TextField key={key} label={field.label} value={current} onChange={text => update(field.path, text)} />
                }
                return <NumberField
                    key={key}
                    label={field.label}
                    value={current as number}
                    minValue={field.min}
                    maxValue={field.max}
                    formatOptions={field.hex ? undefined : { maximumFractionDigits: 0 }}
                    description={field.hex ? `0x${(current as number).toString(16).toUpperCase().padStart(6, "0")}` : undefined}
                    onChange={number => {
                        if (!Number.isNaN(number)) {
                            update(field.path, Math.round(number))
                        }
                    }}
                />
            })}
        </Flex>
    }

    return <div className={styles.popup}>
        {/* Commands with their own fields are labeled by them, and the rest by what the command is */}
        {!(variant in FIELDS) && variant !== "Branch" && <h3 className={styles.heading}>{commandName(event)}</h3>}
        {body}
    </div>
}
