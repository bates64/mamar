import { View, ActionButton, Tooltip, TooltipTrigger } from "@adobe/react-spectrum"
import { fileSave } from "browser-fs-access"
import { CSSProperties, useCallback, useEffect } from "react"

import ExportButton from "./ExportButton"
import OpenButton from "./OpenButton"
import ReimportButton from "./ReimportButton"

import Bridge from "../bridge"
import { useDoc, useRoot } from "../store"
import { useOptionalSoundBank } from "../util/hooks/useSoundBank"
import { encodeForGame } from "../util/recordings"

function createBgmFileName(fileName: string) {
    // Remove supported extension
    let extension = ""
    if (fileName.endsWith(".bgm") || fileName.endsWith(".ron") || fileName.endsWith(".mid")) {
        const index = fileName.lastIndexOf(".")
        if (index !== -1) {
            fileName = fileName.substring(0, index)
            extension = fileName.substring(index + 1)
        }
    }
    fileName += extension === ".ron" ? ".ron" : ".bgm"
    return fileName
}

export default function BgmActionGroup() {
    const [, dispatch] = useRoot()
    const [doc, docDispatch] = useDoc()
    const sbn = useOptionalSoundBank()

    JSON.stringify(doc?.bgm)

    const save = useCallback(async (saveAs: boolean) => {
        if (!doc) {
            return
        }

        // A song made from a MIDI file saves what was changed since it was imported, so a reimport can keep it
        const bgm = doc.bgm.import && doc.importBase ? Bridge.import_patch(doc.bgm, doc.importBase) : doc.bgm

        // TODO: surface an error encoding it in a dialog
        const bgmBin = encodeForGame(bgm, sbn) as Uint8Array<ArrayBuffer>

        const fileHandle = await fileSave(new Blob([bgmBin]), {
            fileName: createBgmFileName(doc.name),
            extensions: [".bgm", ".ron"],
            startIn: "music",
        }, saveAs ? undefined : doc.fileHandle)

        // If it was saved as .ron, overwrite the file contents (currently BGM) with the RON
        if (fileHandle?.name.endsWith(".ron")) {
            const writable = await fileHandle.createWritable({ keepExistingData: false })
            await writable.write(Bridge.ron_encode(bgm))
            await writable.close()
        }

        docDispatch({ type: "mark_saved", fileHandle })
    }, [doc, docDispatch, sbn])

    useEffect(() => {
        const handleKeyDown = (evt: KeyboardEvent) => {
            if (evt.ctrlKey && evt.key === "s") {
                evt.preventDefault()
                save(evt.shiftKey)
                return
            }

            // Text fields keep their own undo
            const target = evt.target as HTMLElement
            if (!(evt.ctrlKey || evt.metaKey) || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
                return
            }
            const key = evt.key.toLowerCase()
            if (key === "z" && !evt.shiftKey) {
                evt.preventDefault()
                dispatch.undo()
            } else if ((key === "z" && evt.shiftKey) || key === "y") {
                evt.preventDefault()
                dispatch.redo()
            }
        }
        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [save, dispatch])

    const props = {
        isQuiet: true,
    }

    return <View UNSAFE_style={{
        "position": "absolute",
        "left": "calc(env(titlebar-area-x, 30px) + 8px)",
        "WebkitAppRegion": "no-drag",
    } as CSSProperties}>
        <ActionButton
            // A new song has no changes to lose until it's edited
            onPress={() => dispatch({ type: "open_doc", isSaved: true })}
            {...props}
        >New</ActionButton>
        <OpenButton />
        <TooltipTrigger>
            <ActionButton
                onPress={evt => save(evt.shiftKey)}
                isDisabled={!doc}
                {...props}
            >
                Save
            </ActionButton>
            <Tooltip>Hold Shift to <i>Save As</i></Tooltip>
        </TooltipTrigger>
        <ReimportButton />
        <ExportButton />
    </View>
}
