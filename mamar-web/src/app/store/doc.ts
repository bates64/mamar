import { Bgm } from "pm64-typegen"

import { BgmAction, bgmReducer } from "./bgm"
import { useRoot } from "./dispatch"

export type PanelContent = {
    type: "not_open"
} | {
    type: "tracker"
    trackList: number
    track: number
    segment: number
}

export interface Doc {
    id: string
    bgm: Bgm
    fileHandle?: FileSystemFileHandle
    name: string
    isSaved: boolean
    activeVariation: number
    panelContent: PanelContent
}

export type DocAction = {
    type: "bgm"
    action: BgmAction
} | {
    type: "mark_saved"
    fileHandle?: FileSystemFileHandle | null
} | {
    type: "set_panel_content"
    panelContent: PanelContent
} | {
    type: "set_variation"
    index: number
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
            fileHandle: action.fileHandle ?? state.fileHandle,
            name: action.fileHandle?.name ?? state.name,
        }
    case "set_panel_content":
        return {
            ...state,
            panelContent: action.panelContent,
        }
    case "set_variation":
        return {
            ...state,
            activeVariation: action.index,
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
