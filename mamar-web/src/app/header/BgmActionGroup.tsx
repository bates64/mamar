import { View, ActionButton } from "@adobe/react-spectrum"
import { CSSProperties } from "react"

import OpenButton from "./OpenButton"

import { useDoc, useRoot } from "../store"

export default function BgmActionGroup() {
    const [, dispatch] = useRoot()
    const [doc, docDispatch] = useDoc()

    const props = {
        isQuiet: true,
    }

    return <View UNSAFE_style={{
        "position": "absolute",
        "left": "calc(env(titlebar-area-x, 30px) + 8px)",
        "-webkit-app-region": "no-drag",
    } as CSSProperties}>
        <ActionButton
            onPress={() => dispatch({ type: "open_doc" })}
            {...props}
        >New</ActionButton>
        <OpenButton />
        <ActionButton
            onPress={async () => {
                // TODO: save file
                docDispatch({ type: "mark_saved" })
            }}
            isDisabled={!doc || !doc.isSaved}
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
