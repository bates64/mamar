import { FileWithHandle } from "browser-fs-access"
import { new_bgm, bgm_add_voice, bgm_decode } from "mamar-wasm-bridge"
import { Bgm, Variation, Segment } from "pm64-typegen"
import { createContainer } from "react-tracked"
import useUndoable from "use-undoable"

function generateId() {
    return Math.random().toString(36).substring(2, 15)
}

//

export type SegmentAction = {
    type: "set_loop_iter_count"
    iter_count: number
}

export function segmentReducer(segment: Segment, action: SegmentAction): Segment {
    switch (action.type) {
    case "set_loop_iter_count":
        if (segment.type === "EndLoop") {
            return {
                ...segment,
                iter_count: action.iter_count,
            }
        } else {
            console.warn("Tried to set loop iter count on non-end loop segment")
            return segment
        }
    }
}

export const useSegment = (id?: number, variationIndex?: number, docId?: string): [Segment | undefined, (action: SegmentAction) => void] => {
    const [variation, dispatch] = useVariation(variationIndex, docId)
    return [
        variation?.segments.find(s => s.id === id),
        action => {
            if (id) {
                dispatch({
                    type: "segment",
                    id,
                    action,
                })
            }
        },
    ]
}

//

export type VariationAction = {
    type: "segment"
    id: number
    action: SegmentAction
} | {
    type: "move_segment"
    id: number
    toIndex: number
}

export function variationReducer(variation: Variation, action: VariationAction): Variation {
    switch (action.type) {
    case "segment":
        return {
            ...variation,
            segments: variation.segments.map(segment => {
                if (segment.id === action.id) {
                    return segmentReducer(segment, action.action)
                } else {
                    return segment
                }
            }),
        }
    case "move_segment":
        const fromIndex = variation.segments.findIndex(s => s.id === action.id)
        if (fromIndex !== -1) {
            const segment = variation.segments[fromIndex]
            let segments: (Segment | null)[] = JSON.parse(JSON.stringify(variation.segments))

            segments[fromIndex] = null
            segments.splice(action.toIndex, 0, segment)
            segments = segments.filter(s => s !== null)

            // If EndLoop > StartLoop, swap them
            for (let i = 0; i < segments.length; i++) {
                const endLoop = segments[i]
                if (endLoop?.type === "EndLoop") {
                    for (let j = i + 1; j < segments.length; j++) {
                        const startLoop = segments[j]
                        if (startLoop?.type === "StartLoop" && startLoop.label_index === endLoop.label_index) {
                            const temp = segments[i]
                            segments[i] = segments[j]
                            segments[j] = temp
                            break
                        }
                    }
                }
            }

            // If StartLoop and EndLoop are next to each other, remove them
            for (let i = 0; i < segments.length - 1; i++) {
                const a = segments[i]
                const b = segments[i + 1]
                if (a?.type === "StartLoop" &&
                    b?.type === "EndLoop" &&
                    a.label_index === b.label_index
                ) {
                    segments[i] = null
                    segments[i + 1] = null
                }
            }

            return {
                ...variation,
                segments: segments.filter(s => s !== null) as Segment[],
            }
        } else {
            return variation
        }
    }
}

export const useVariation = (index?: number, docId?: string): [Variation | undefined, (action: VariationAction) => void] => {
    const [bgm, dispatch] = useBgm(docId)
    return [
        bgm?.variations[index as number] ?? undefined,
        action => {
            if (typeof index === "number") {
                dispatch({
                    type: "variation",
                    index,
                    action,
                })
            }
        },
    ]
}

//

export type BgmAction = {
    type: "variation"
    index: number
    action: VariationAction
} | {
    type: "add_voice"
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
    }
}

export const useBgm = (docId?: string): [Bgm | undefined, (action: BgmAction) => void] => {
    const [doc, dispatch] = useDoc(docId)
    return [doc?.bgm, action => dispatch({ type: "bgm", action })]
}

//

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
            name: action.name || action.file?.name || "New song",
            isSaved: true,
            activeTrackListId: -1,
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
        switch (action.action.type) {
        case "bgm":
            return true
        }
    }
    return false
}

interface Action {
    type: string
    action?: Action
}

function joinActionTypes(action: Action): string {
    if (action.action) {
        return `${action.type}/${joinActionTypes(action.action)}`
    } else {
        return action.type
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
        console.info("dispatch", joinActionTypes(action), action)
        setState(
            prevState => {
                const newState = rootReducer(prevState, action)
                console.log("new state", newState)
                return newState
            },
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
