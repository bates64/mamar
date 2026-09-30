import { FileWithHandle } from "browser-fs-access"
import { Bgm } from "pm64-typegen"

import { DEFAULT_LOCATION, DEFAULT_SNAP, Doc, DocAction, docReducer } from "./doc"

import Bridge from "../bridge"
import { removeRecordings } from "../util/recordings"
import vanillaBeatsPerBar from "../util/vanillaBeatsPerBar"

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
    isSaved?: boolean
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
            isSaved: action.isSaved ?? saveSupported,
            activeVariation: 0,
            panelContent: {
                type: "not_open",
            },
            location: DEFAULT_LOCATION,
            snap: DEFAULT_SNAP,
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

/**
 * Decodes a BGM or MIDI file. With the sound bank (SBN) of the user's ROM, a BGM file's switches between recordings of
 * its tracks' instruments are taken out, to be put back as the song is built. See util/recordings. A MIDI file's tracks
 * are new, so they're built with the switches they need.
 */
function decode(data: Uint8Array, sbn: ArrayBuffer | null | undefined): { bgm: Bgm } {
    const bgm: Bgm | string = Bridge.bgm_decode(data)

    if (typeof bgm === "string") {
        throw new Error(bgm)
    }
    bgm.beats_per_bar ??= vanillaBeatsPerBar(data)

    // "MThd"
    const isMidi = data[0] === 0x4D && data[1] === 0x54 && data[2] === 0x68 && data[3] === 0x64
    return { bgm: sbn && !isMidi ? removeRecordings(bgm, sbn) : bgm }
}

export async function openFile(file: FileWithHandle, sbn?: ArrayBuffer | null): Promise<RootAction> {
    return {
        type: "open_doc",
        file,
        ...decode(new Uint8Array(await file.arrayBuffer()), sbn),
    }
}

export function openData(data: Uint8Array, name?: string, isSaved?: boolean, sbn?: ArrayBuffer | null): RootAction {
    return {
        type: "open_doc",
        name,
        isSaved,
        ...decode(data, sbn),
    }
}
