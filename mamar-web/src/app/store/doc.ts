import { FileWithHandle } from "browser-fs-access"
import { Bgm } from "pm64-typegen"

import { BgmAction, bgmReducer } from "./bgm"
import { useRoot } from "./dispatch"

export interface Doc {
    id: string
    bgm: Bgm
    file?: FileWithHandle
    name: string
    isSaved: boolean
    activeTrackListId: number
}

export type DocAction = {
    type: "bgm"
    action: BgmAction
} | {
    type: "mark_saved"
} | {
    type: "open_track_list"
    trackListId: number
} | {
    type: "close_track_list"
}

export function docReducer(state: Doc, action: DocAction): Doc {
    switch (action.type) {
    case "bgm":
        return {
            ...state,
            bgm: bgmReducer(state.bgm, action.action),
            isSaved: false,
        }
    case "mark_saved":
        return {
            ...state,
            isSaved: true,
        }
    case "open_track_list":
        return {
            ...state,
            activeTrackListId: action.trackListId,
        }
    case "close_track_list":
        return {
            ...state,
            activeTrackListId: -1,
        }
    }
}

export const useDoc = (id?: string): [Doc | undefined, (action: DocAction) => void] => {
    const [root, dispatch] = useRoot()
    const trueId = id ?? root.activeDocId
    const doc = trueId ? root.docs[trueId] : undefined
    const docDispatch = (action: DocAction) => {
        if (trueId) {
            dispatch({ type: "doc", id: trueId, action })
        }
    }
    return [doc, docDispatch]
}
