import produce from "immer"
import { bgm_add_voice } from "mamar-wasm-bridge"
import { Bgm, Event, Instrument } from "pm64-typegen"
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
    isDisabled?: boolean
    polyphonicIdx?: number
    isDrumTrack?: boolean
    parentTrackIdx?: number
} | {
    type: "update_instrument"
    index: number
    partial: Partial<Instrument>
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
            const { commands } = draft.trackLists[action.trackList].tracks[action.track]
            commands.vec = arrayMove(commands.vec, action.oldIndex, action.newIndex)
        })
    case "update_track_command":
        return produce(bgm, draft => {
            const { commands } = draft.trackLists[action.trackList].tracks[action.track]
            for (let i = 0; i < commands.vec.length; i++) {
                if (commands.vec[i].id === action.command.id) {
                    commands.vec[i] = action.command
                }
            }
        })
    case "delete_track_command":
        return produce(bgm, draft => {
            const { commands } = draft.trackLists[action.trackList].tracks[action.track]
            commands.vec.splice(action.index, 1)
        })
    case "modify_track_settings":
        return produce(bgm, draft => {
            const track = draft.trackLists[action.trackList].tracks[action.track]
            if (action.isDisabled !== undefined) {
                track.isDisabled = action.isDisabled
            }
            if (action.polyphonicIdx !== undefined) {
                track.polyphonicIdx = action.polyphonicIdx
            }
            if (action.isDrumTrack !== undefined) {
                track.isDrumTrack = action.isDrumTrack
            }
            if (action.parentTrackIdx !== undefined) {
                track.parentTrackIdx = action.parentTrackIdx
            }
        })
    case "update_instrument":
        return produce(bgm, draft => {
            const instrument = draft.instruments[action.index]
            Object.assign(instrument, action.partial)
        })
    }
}

export const useBgm = (docId?: string): [Bgm | undefined, (action: BgmAction) => void] => {
    const [doc, dispatch] = useDoc(docId)
    return [doc?.bgm, action => dispatch({ type: "bgm", action })]
}
