import { View, ActionButton } from "@adobe/react-spectrum"

import OpenButton from "./OpenButton"

import { useDoc, useRoot } from "../store"

export default function BgmActionGroup() {
    const [, dispatch] = useRoot()
    const [doc, docDispatch] = useDoc()

    const props = {
        isQuiet: true,
    }

    return <View>
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
            isDisabled={doc?.isSaved}
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
