import produce, { current, setAutoFreeze } from "immer"
import { Bgm, Command, Event, Instrument, Polyphony, Track, TrackList } from "pm64-typegen"
import { arrayMove } from "react-movable"

import { useDoc } from "./doc"
import { VariationAction, variationReducer } from "./variation"

import Bridge from "../bridge"

// Freezing react-tracked proxies can cause proxy invariant errors
setAutoFreeze(false)

export type BgmAction = {
    type: "variation"
    index: number
    action: VariationAction
} | {
    type: "add_voice"
} | {
    type: "move_track_command"
    trackList: number
    track: number
    oldIndex: number
    newIndex: number
} | {
    type: "update_track_command"
    trackList: number
    track: number
    command: Event
} | {
    type: "delete_track_command"
    trackList: number
    track: number
    index: number
} | {
    type: "modify_track_settings"
    trackList: number
    track: number
    name?: string
    isDisabled?: boolean
    polyphony?: Polyphony
    isDrumTrack?: boolean
} | {
    type: "update_instrument"
    index: number
    partial: Partial<Instrument>
} | {
    type: "split_variation"
    variation: number
    time: number
} | {
    type: "set_beats_per_bar"
    beatsPerBar: number
} | {
    type: "insert_track_command"
    trackList: number
    track: number
    time: number
    command: Command
} | {
    type: "add_alternate_part"
    trackLists: number[]
    track: number
} | {
    type: "remove_alternate_part"
    trackList: number
    track: number
} | {
    type: "set_alternate_parts_name"
    name: string
} | {
    type: "set_mix_name"
    mix: number
    name: string
}

/** The index of the track that is an alternate part for track `index` of `trackList`, if there is one. */
export function alternatePartOf(trackList: TrackList, index: number): number | undefined {
    const alternate = trackList.tracks.findIndex(track => !track.is_disabled && track.alternate_for === index)
    return alternate >= 0 ? alternate : undefined
}

/** The index of the track that plays as track `index` of `trackList`: its alternate part, if alternate parts are on. */
export function playingTrack(trackList: TrackList, index: number, alternateParts: boolean): number {
    return (alternateParts ? alternatePartOf(trackList, index) : undefined) ?? index
}

/** A slot after track `index` of `trackList` that's free for an alternate part. */
function freeSlotAfter(trackList: TrackList, index: number): number | undefined {
    const slot = trackList.tracks.findIndex((track, i) => i > index && track.is_disabled && track.commands.length === 0)
    return slot >= 0 ? slot : undefined
}

/** Whether an alternate part can be added for track `index` of `trackList`. */
export function canAddAlternatePart(trackList: TrackList, index: number): boolean {
    return index > 0 && alternatePartOf(trackList, index) === undefined && freeSlotAfter(trackList, index) !== undefined
}

/**
 * Prepares a track's commands to be edited: writes out its detours, which the editor doesn't show, and forgets where
 * it was decoded from, so the encoder compresses it into detours again.
 */
function editCommands(track: Track) {
    track.commands = Bridge.commands_without_detours(current(track).commands)
    delete track.pos
}

export function bgmReducer(bgm: Bgm, action: BgmAction): Bgm {
    switch (action.type) {
    case "variation": {
        const applyVariation = (index: number) => {
            const variation = bgm.variations[index]
            if (index === action.index && variation) {
                return variationReducer(variation, action.action)
            } else {
                return variation
            }
        }
        return {
            ...bgm,
            variations: [
                applyVariation(0),
                applyVariation(1),
                applyVariation(2),
                applyVariation(3),
            ],
        }
    } case "add_voice":
        return Bridge.bgm_add_voice(bgm)
    case "move_track_command":
        return produce(bgm, draft => {
            const track = draft.track_lists[action.trackList].tracks[action.track]
            editCommands(track)
            track.commands = arrayMove(track.commands, action.oldIndex, action.newIndex)
        })
    case "update_track_command":
        return produce(bgm, draft => {
            const track = draft.track_lists[action.trackList].tracks[action.track]
            editCommands(track)
            for (let i = 0; i < track.commands.length; i++) {
                if (track.commands[i].id === action.command.id) {
                    track.commands[i] = action.command
                }
            }
        })
    case "delete_track_command":
        return produce(bgm, draft => {
            const track = draft.track_lists[action.trackList].tracks[action.track]
            editCommands(track)
            track.commands.splice(action.index, 1)
        })
    case "modify_track_settings":
        return produce(bgm, draft => {
            const track = draft.track_lists[action.trackList].tracks[action.track]
            if (action.name !== undefined) {
                track.name = action.name
            }
            if (action.isDisabled !== undefined) {
                track.is_disabled = action.isDisabled
            }
            if (action.polyphony !== undefined) {
                track.polyphony = action.polyphony
            }
            if (action.isDrumTrack !== undefined) {
                track.is_drum_track = action.isDrumTrack
            }
        })
    case "update_instrument":
        return produce(bgm, draft => {
            const instrument = draft.instruments[action.index]
            Object.assign(instrument, action.partial)
        })
    case "split_variation":
        return Bridge.bgm_split_variation_at(bgm, action.variation, action.time)
    case "set_beats_per_bar":
        return { ...bgm, beats_per_bar: action.beatsPerBar }
    case "insert_track_command":
        return produce(bgm, draft => {
            const track = draft.track_lists[action.trackList].tracks[action.track]
            editCommands(track)
            track.commands = Bridge.commands_insert(current(track).commands, action.time, action.command)
        })
    case "add_alternate_part":
        return produce(bgm, draft => {
            for (const id of action.trackLists) {
                const trackList = draft.track_lists[id]
                if (!trackList || !canAddAlternatePart(current(trackList), action.track)) {
                    continue
                }
                const main = trackList.tracks[action.track]
                if (main.commands.length === 0) {
                    continue
                }
                const slot = freeSlotAfter(current(trackList), action.track)!
                trackList.tracks[slot] = {
                    name: main.name,
                    is_disabled: false,
                    polyphony: current(main).polyphony,
                    is_drum_track: main.is_drum_track,
                    alternate_for: action.track,
                    commands: Bridge.commands_copy(Bridge.commands_without_detours(current(main).commands)),
                }
            }
        })
    case "remove_alternate_part":
        return produce(bgm, draft => {
            const trackList = draft.track_lists[action.trackList]
            const slot = alternatePartOf(current(trackList), action.track)
            if (slot !== undefined) {
                trackList.tracks[slot] = {
                    name: "",
                    is_disabled: true,
                    polyphony: "Automatic",
                    is_drum_track: false,
                    commands: [],
                }
            }
        })
    case "set_alternate_parts_name":
        return { ...bgm, alternate_parts_name: action.name || undefined }
    case "set_mix_name": {
        const mix_names = { ...bgm.mix_names }
        if (action.name) {
            mix_names[action.mix] = action.name
        } else {
            delete mix_names[action.mix]
        }
        return { ...bgm, mix_names }
    }
    }
}

export const useBgm = (docId?: string): [Bgm | undefined, (action: BgmAction) => void] => {
    const [doc, dispatch] = useDoc(docId)
    return [doc?.bgm, action => dispatch({ type: "bgm", action })]
}
