import produce from "immer"
import { bgm_add_voice, bgm_split_variation_at } from "mamar-wasm-bridge"
import { Bgm, Event, Instrument, Polyphony } from "pm64-typegen"
import { arrayMove } from "react-movable"

import { useDoc } from "./doc"
import { VariationAction, variationReducer } from "./variation"

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
        return bgm_add_voice(bgm)
    case "move_track_command":
        return produce(bgm, draft => {
            const track = draft.track_lists[action.trackList].tracks[action.track]
            track.commands = arrayMove(track.commands, action.oldIndex, action.newIndex)
        })
    case "update_track_command":
        return produce(bgm, draft => {
            const track = draft.track_lists[action.trackList].tracks[action.track]
            for (let i = 0; i < track.commands.length; i++) {
                if (track.commands[i].id === action.command.id) {
                    track.commands[i] = action.command
                }
            }
        })
    case "delete_track_command":
        return produce(bgm, draft => {
            const track = draft.track_lists[action.trackList].tracks[action.track]
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
        return bgm_split_variation_at(bgm, action.variation, action.time)
    }
}

export const useBgm = (docId?: string): [Bgm | undefined, (action: BgmAction) => void] => {
    const [doc, dispatch] = useDoc(docId)
    return [doc?.bgm, action => dispatch({ type: "bgm", action })]
}
