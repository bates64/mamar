import { Content, Dialog, Flex, Heading, Item, NumberField, Picker, Text, TextField } from "@adobe/react-spectrum"
import { Event } from "pm64-typegen"

import { commandName } from "./lanes"
import { toEvent } from "./useLaneEditing"

import * as instruments from "../instruments"
import { useBgm } from "../store"

type Value = number | string | { [key: string]: Value }

interface Field {
    /** Path to the value within the command's fields. An empty path is the command's own value. */
    path: string[]
    label: string
    min?: number
    max?: number
    hex?: boolean
    options?: string[]
}

const BANK_SETS = ["Aux", "Set2", "Default", "Music", "Set4", "Set5", "Set6", "AuxCopy"]

/** The fields to edit for each kind of command. Others edit every number in the command. */
const FIELDS: Record<string, Field[]> = {
    EventTrigger: [{ path: ["event_info"], label: "Event", min: 0, max: 0xFFFFFF, hex: true }],
    TriggerSound: [{ path: ["sound"], label: "Sound effect", min: 0, max: 255 }],
    TrackOverridePatch: [
        { path: ["bank_set"], label: "Bank set", options: BANK_SETS },
        { path: ["bank"], label: "Bank", min: 0, max: 15 },
        { path: ["instrument"], label: "Instrument", min: 0, max: 15 },
        { path: ["envelope"], label: "Envelope", min: 0, max: 3 },
    ],
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
        { path: ["volume1"], label: "Volume at full mix (0 applies the volumes)", min: 0, max: 255 },
        { path: ["volume2"], label: "Volume otherwise", min: 0, max: 255 },
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
            {variant === "TrackOverridePatch" && <Text>{instruments.getName(value as never)}</Text>}
            {shown.map(field => {
                const current = get(value, field.path)
                const key = field.path.join(".") || "value"
                if (field.options) {
                    return <Picker
                        key={key}
                        label={field.label}
                        selectedKey={String(current)}
                        onSelectionChange={selected => update(field.path, String(selected))}
                        items={field.options.map(option => ({ key: option }))}
                    >
                        {item => <Item key={item.key}>{item.key}</Item>}
                    </Picker>
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

    return <Dialog size="S">
        <Heading>{commandName(event)}</Heading>
        <Content>{body}</Content>
    </Dialog>
}
