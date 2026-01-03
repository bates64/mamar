import { FileWithHandle } from "browser-fs-access"
import { Bgm } from "pm64-typegen"

import { Doc, DocAction, docReducer } from "./doc"

import Bridge from "../bridge"

function generateId() {
    return Math.random().toString(36).substring(2, 15)
}

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
        const fileExtension = action.file?.name?.split(".").pop()?.toLowerCase()
        const saveSupported = fileExtension === "bgm" || fileExtension === "ron"
        const newDoc: Doc = {
            id: generateId(),
            bgm: action.bgm ?? Bridge.new_bgm(),
            fileHandle: saveSupported ? action.file?.handle : undefined,
            name: action.name || action.file?.name || "New song",
            isSaved: saveSupported,
            activeVariation: 0,
            panelContent: {
                type: "not_open",
            },
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
    const bgm: Bgm | string = Bridge.bgm_decode(data)

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
    const bgm: Bgm | string = Bridge.bgm_decode(data)

    if (typeof bgm === "string") {
        throw new Error(bgm)
    }

    return {
        type: "open_doc",
        name,
        bgm,
    }
}
