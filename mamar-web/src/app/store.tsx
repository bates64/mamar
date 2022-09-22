import { FileWithHandle } from "browser-fs-access"
import { new_bgm, bgm_add_voice, bgm_decode } from "mamar-wasm-bridge"
import { Bgm } from "pm64-typegen"
import { createContainer } from "react-tracked"
import useUndoable from "use-undoable"

function generateId() {
    return Math.random().toString(36).substring(2, 15)
}

//

export type BgmAction = {
    type: "add_voice"
}

export function bgmReducer(bgm: Bgm, action: BgmAction): Bgm {
    switch (action.type) {
    case "add_voice":
        return bgm_add_voice(bgm)
    }
}

//

export interface Doc {
    id: string
    bgm: Bgm
    file?: FileWithHandle
    name?: string
}

export type DocAction = {
    type: "bgm"
    action: BgmAction
}

export function docReducer(state: Doc, action: DocAction): Doc {
    switch (action.type) {
    case "bgm":
        return {
            ...state,
            bgm: bgmReducer(state.bgm, action.action),
        }
    }
}

//

export interface Root {
    docs: { [id: string]: Doc }
    activeDocId?: string
}

export type RootAction = {
    type: "doc"
    id: string
    action: DocAction
} | {
    type: "focus_doc"
    id: string
} | {
    type: "open_doc"
    file?: FileWithHandle
    name?: string
    bgm?: Bgm
} | {
    type: "close_doc"
    id: string
}

export function rootReducer(root: Root, action: RootAction): Root {
    switch (action.type) {
    case "doc":
        return {
            ...root,
            docs: {
                ...root.docs,
                [action.id]: docReducer(root.docs[action.id], action.action),
            },
        }
    case "focus_doc":
        return {
            ...root,
            activeDocId: action.id,
        }
    case "open_doc": {
        const newDoc: Doc = {
            id: generateId(),
            bgm: action.bgm ?? new_bgm(),
            file: action.file,
            name: action.name ?? action.file?.name ?? "New song",
        }
        return {
            ...root,
            docs: {
                ...root.docs,
                [newDoc.id]: newDoc,
            },
            activeDocId: newDoc.id,
        }
    } case "close_doc": {
        const newDocs = Object.assign({}, root.docs)
        delete newDocs[action.id]

        const docValues = Object.values(newDocs)
        const lastDoc = docValues.length > 0 ? docValues[docValues.length - 1] : undefined

        return {
            ...root,
            docs: newDocs,
            activeDocId: root.activeDocId === action.id ? lastDoc?.id : root.activeDocId,
        }
    }
    }
}

export async function openFile(file: FileWithHandle): Promise<RootAction> {
    const data = new Uint8Array(await file.arrayBuffer())
    const bgm: Bgm | string = bgm_decode(data)

    if (typeof bgm === "string") {
        throw new Error(bgm)
    }

    return {
        type: "open_doc",
        file,
        bgm,
    }
}

export function openData(data: Uint8Array, name?: string): RootAction {
    const bgm: Bgm | string = bgm_decode(data)

    if (typeof bgm === "string") {
        throw new Error(bgm)
    }

    return {
        type: "open_doc",
        name,
        bgm,
    }
}

//

interface Dispatch {
    (action: RootAction): void
    undo: () => void
    redo: () => void
    canUndo: boolean
    canRedo: boolean
}

function shouldActionCommitToHistory(action: RootAction): boolean {
    switch (action.type) {
    case "doc":
        return true
    default:
        return false
    }
}

const {
    Provider,
    useTracked,
} = createContainer(() => {
    const [state, setState, { undo, redo, canUndo, canRedo }] = useUndoable<Root>({
        docs: {},
    }, {
        behavior: "destroyFuture", // "mergePastReversed",
        historyLimit: 100,
    })

    const dispatch: Dispatch = action => {
        console.info("dispatch", action)
        setState(
            state => rootReducer(state, action),
            undefined,
            !shouldActionCommitToHistory(action),
        )
    }
    dispatch.undo = undo
    dispatch.redo = redo
    dispatch.canUndo = canUndo
    dispatch.canRedo = canRedo

    return [state, dispatch]
})

export const RootProvider = Provider

export const useRoot: () => [Root, Dispatch] = useTracked as any

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

export const useBgm = (id?: string): [Bgm | undefined, (action: BgmAction) => void] => {
    const [doc, dispatch] = useDoc(id)
    return [doc?.bgm, action => dispatch({ type: "bgm", action })]
}
