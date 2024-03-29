import { View, ActionButton } from "@adobe/react-spectrum"
import { fileSave } from "browser-fs-access"
import { bgm_encode } from "mamar-wasm-bridge"
import { CSSProperties, useCallback, useEffect } from "react"

import OpenButton from "./OpenButton"

import { useDoc, useRoot } from "../store"

function trimFileName(fileName: string) {
    const index = fileName.lastIndexOf(".")
    if (index === -1) {
        return fileName
    } else {
        return fileName.substring(0, index)
    }
}

export default function BgmActionGroup() {
    const [, dispatch] = useRoot()
    const [doc, docDispatch] = useDoc()

    JSON.stringify(doc?.bgm)

    const save = useCallback(async (saveAs: boolean) => {
        if (!doc) {
            return
        }

        const bgmBin: Uint8Array | string = bgm_encode(doc.bgm)

        if (typeof bgmBin === "string") {
            // TODO: surface error in a dialog
            throw new Error(bgmBin)
        }

        const handle = await fileSave(new Blob([bgmBin]), {
            fileName: trimFileName(doc.name) + ".bgm",
            extensions: [".bgm"],
        }, saveAs ? undefined : doc.fileHandle)

        if (handle) {
            doc.fileHandle = handle
        }

        docDispatch({ type: "mark_saved" })
    }, [doc, docDispatch])

    useEffect(() => {
        const handleKeyDown = (evt: KeyboardEvent) => {
            if (evt.ctrlKey && evt.key === "s") {
                evt.preventDefault()
                save(evt.shiftKey)
            }
        }
        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [save])

    const props = {
        isQuiet: true,
    }

    return <View UNSAFE_style={{
        "position": "absolute",
        "left": "calc(env(titlebar-area-x, 30px) + 8px)",
        "WebkitAppRegion": "no-drag",
    } as CSSProperties}>
        <ActionButton
            onPress={() => dispatch({ type: "open_doc" })}
            {...props}
        >New</ActionButton>
        <OpenButton />
        <ActionButton
            onPress={evt => save(evt.shiftKey)}
            isDisabled={!doc || (doc.isSaved && !!doc?.fileHandle)}
            {...props}
        >Save</ActionButton>
        <ActionButton
            onPress={() => dispatch.undo()}
            isDisabled={!dispatch.canUndo}
            {...props}
        >Undo</ActionButton>
        <ActionButton
            onPress={() => dispatch.redo()}
            isDisabled={!dispatch.canRedo}
            {...props}
        >Redo</ActionButton>
    </View>
}
