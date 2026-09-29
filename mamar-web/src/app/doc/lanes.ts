import { Bgm, Command, Event } from "pm64-typegen"

import Bridge from "../bridge"
import * as instruments from "../instruments"

/** A command in a lane, at `time` ticks from the start of its segment. */
export interface LanePoint {
    event: Event
    time: number
    value: number
    /** Ticks a fade to `value` takes, if the point is a fade. */
    fade?: number
}

/** A kind of lane: which commands it shows, and how to make them. */
export interface LaneKind {
    key: string
    name: string
    min: number
    max: number
    /** A line for values that change gradually, or labeled spans for values that each hold until the next. */
    display: "line" | "spans"
    read(command: Record<string, unknown>): { value: number, fade?: number } | undefined
    set(value: number): Command
    /** Changes the value of `command`, for commands with other fields to keep. Defaults to `set`. */
    update?(command: Record<string, unknown>, value: number): Command
    fade?(value: number, time: number): Command
    format?(value: number): string
}

type Fields = Record<string, number>

function simple(key: string, name: string, variant: string, min: number, max: number, format?: (value: number) => string): LaneKind {
    return {
        key, name, min, max, format, display: "line",
        read: command => (variant in command ? { value: command[variant] as number } : undefined),
        set: value => ({ [variant]: value }) as Command,
    }
}

function field(
    key: string, name: string, variant: string, valueField: string, min: number, max: number,
    display: LaneKind["display"], format?: (value: number) => string,
): LaneKind {
    return {
        key, name, min, max, format, display,
        read: command => (variant in command ? { value: (command[variant] as Fields)[valueField] } : undefined),
        set: value => ({ [variant]: { [valueField]: value } }) as Command,
    }
}

const signed = (unit: string) => (value: number) => `${value > 0 ? "+" : ""}${value} ${unit}`

export const TRACK_LANES: LaneKind[] = [
    {
        ...simple("volume", "Volume", "SubTrackVolume", 0, 127),
        read: command => {
            if ("SubTrackVolume" in command) {
                return { value: command.SubTrackVolume as number }
            } else if ("TrackVolumeFade" in command) {
                const fade = command.TrackVolumeFade as Fields
                return { value: fade.value, fade: fade.time }
            }
        },
        fade: (value, time) => ({ TrackVolumeFade: { time, value } }),
    },
    simple("trackVolume", "Track volume", "SegTrackVolume", 0, 127),
    simple("pan", "Pan", "SubTrackPan", 0, 127, value => (value === 64 ? "Center" : value < 64 ? `L${64 - value}` : `R${value - 64}`)),
    simple("reverb", "Reverb", "SubTrackReverb", 0, 127),
    simple("coarseTune", "Coarse tune", "SubTrackCoarseTune", -24, 24, signed("st")),
    simple("fineTune", "Fine tune", "SubTrackFineTune", -100, 100, signed("cents")),
    field("pitchBend", "Pitch bend", "SegTrackTune", "bend", -1200, 1200, "line", signed("cents")),
]

/** Lanes for a track's commands other than notes, some of which name the song's instruments. */
export function trackLanes(bgm: Bgm): LaneKind[] {
    return [
        ...TRACK_LANES,
        {
            key: "instrument", name: "Instrument", min: 0, max: Math.max(0, bgm.instruments.length - 1), display: "spans",
            format: index => {
                const instrument = bgm.instruments[index]
                return instrument ? `${index}: ${instruments.getName(instrument.patch)}` : `${index}`
            },
            read: command => ("SetTrackVoice" in command ? { value: (command.SetTrackVoice as Fields).index } : undefined),
            set: index => ({ SetTrackVoice: { index } }),
        },
        {
            key: "tremolo", name: "Tremolo", min: 0, max: 255, display: "spans",
            format: depth => (depth === 0 ? "Off" : `Depth ${depth}`),
            read: command => {
                if ("TrackTremolo" in command) {
                    return { value: (command.TrackTremolo as Fields).depth }
                } else if ("TrackTremoloDepth" in command) {
                    return { value: (command.TrackTremoloDepth as Fields).depth }
                } else if ("TrackTremoloStop" in command) {
                    return { value: 0 }
                }
            },
            set: depth => (depth === 0 ? "TrackTremoloStop" : { TrackTremoloDepth: { depth } }) as Command,
            update: (command, depth) => ("TrackTremolo" in command
                ? { TrackTremolo: { ...(command.TrackTremolo as Fields), depth } }
                : (depth === 0 ? "TrackTremoloStop" : { TrackTremoloDepth: { depth } })) as Command,
        },
        {
            key: "tremoloSpeed", name: "Tremolo speed", min: 0, max: 255, display: "spans",
            read: command => {
                if ("TrackTremoloSpeed" in command) {
                    return { value: command.TrackTremoloSpeed as number }
                } else if ("TrackTremolo" in command) {
                    return { value: (command.TrackTremolo as Fields).speed }
                }
            },
            set: speed => ({ TrackTremoloSpeed: speed }),
            update: (command, speed) => ("TrackTremolo" in command
                ? { TrackTremolo: { ...(command.TrackTremolo as Fields), speed } }
                : { TrackTremoloSpeed: speed }) as Command,
        },
        {
            key: "randomPan", name: "Random pan", min: 0, max: 127, display: "line",
            read: command => ("SubTrackRandomPan" in command ? { value: (command.SubTrackRandomPan as Fields).amount } : undefined),
            set: amount => ({ SubTrackRandomPan: { pan: 64, amount } }),
            update: (command, amount) => ({ SubTrackRandomPan: { ...(command.SubTrackRandomPan as Fields), amount } }) as Command,
        },
        {
            key: "busSend", name: "Bus send", min: 0, max: 3, display: "spans",
            format: busName,
            read: command => ("SubTrackReverbType" in command ? { value: (command.SubTrackReverbType as Fields).index } : undefined),
            set: index => ({ SubTrackReverbType: { index } }),
        },
    ]
}

/** Commands that aren't shown on their own: notes and the structure of the track. */
const STRUCTURE = ["Note", "Delay", "End", "Detour"]

/** Whether any of `lanes` shows `event`, or it's part of the track's structure. */
export function isShown(event: Event, lanes: LaneKind[]): boolean {
    const command = event as unknown as Record<string, unknown>
    return STRUCTURE.some(key => key in command) || lanes.some(kind => kind.read(command) !== undefined)
}

/** A short name for a command, from its variant: "SubTrackReverb" becomes "Sub track reverb". */
export function commandName(event: Event): string {
    const variant = Object.keys(event).find(key => key !== "id") ?? "Command"
    return variant.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/ ([A-Z])/g, (_, letter) => ` ${letter.toLowerCase()}`)
}

export const TEMPO_LANE: LaneKind = {
    ...simple("tempo", "Tempo", "MasterTempo", 30, 300, value => `${value} BPM`),
    read: command => {
        if ("MasterTempo" in command) {
            return { value: command.MasterTempo as number }
        } else if ("MasterTempoFade" in command) {
            const fade = command.MasterTempoFade as Fields
            return { value: fade.value, fade: fade.time }
        }
    },
    fade: (value, time) => ({ MasterTempoFade: { time, value } }),
}

export const TRANSPOSE_LANE = field("transpose", "Transpose", "MasterPitchShift", "semitones", -12, 12, "spans", signed("st"))

export const MASTER_VOLUME_LANE: LaneKind = {
    ...simple("masterVolume", "Volume", "MasterVolume", 0, 127),
    read: command => {
        if ("MasterVolume" in command) {
            return { value: command.MasterVolume as number }
        } else if ("MasterVolumeFade" in command) {
            const fade = command.MasterVolumeFade as Fields
            return { value: fade.volume, fade: fade.time }
        }
    },
    fade: (value, time) => ({ MasterVolumeFade: { time, volume: value } }),
}

/** Names of the effect types the game's buses can have (AuEffectType). */
const EFFECT_NAMES = [
    "None", "Small room", "Big room", "Chorus", "Flange", "Echo",
    "Custom 1", "Custom 2", "Custom 3", "Custom 4", "Big room 2",
]

export function effectName(type: number): string {
    return EFFECT_NAMES[type] ?? `Effect ${type}`
}

/**
 * Names of the buses a song's effect slots send to. The main song player has a main bus, which every track plays
 * through unless sent elsewhere, and an aux bus. Slots 2 and 3 have no bus.
 */
export function busName(slot: number): string {
    return ["Main bus", "Aux bus"][slot] ?? `Slot ${slot} (unused)`
}

function busLane(slot: number): LaneKind {
    return {
        key: `bus${slot}`, name: busName(slot), min: 0, max: EFFECT_NAMES.length - 1, display: "spans",
        format: effectName,
        read: command => {
            const effect = command.MasterEffect as Fields | undefined
            if (effect && effect.index === slot) {
                return { value: effect.value }
            } else if (slot === 0 && "BusEffect" in command) {
                // Sets the effect of the bus the song plays on, which is the main bus
                return { value: (command.BusEffect as Fields).effect_type }
            }
        },
        set: value => ({ MasterEffect: { index: slot, value } }),
    }
}

export const MASTER_LANES: LaneKind[] = [
    MASTER_VOLUME_LANE,
    busLane(0),
    busLane(1),
]

/** Each command `commands` plays before its first End, with the time it plays at. Detours are followed. */
export function timeline(commands: Event[]): { time: number, event: Event }[] {
    const played: Event[] = Bridge.commands_without_detours(commands)
    const result = []
    let time = 0
    for (const event of played) {
        result.push({ time, event })
        const command = event as unknown as Record<string, unknown>
        if ("End" in command) {
            break
        } else if ("Delay" in command) {
            time += command.Delay as number
        }
    }
    return result
}

export function lanePoints(kind: LaneKind, commands: { time: number, event: Event }[]): LanePoint[] {
    return commands.flatMap(({ time, event }) => {
        const read = kind.read(event as unknown as Record<string, unknown>)
        return read ? [{ event, time, ...read }] : []
    })
}

/** The value a lane holds after `points`, if any. */
export function lastValue(points: LanePoint[]): number | undefined {
    return points.length > 0 ? points[points.length - 1].value : undefined
}
