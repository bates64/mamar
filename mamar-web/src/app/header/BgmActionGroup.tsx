import { View, ActionButton } from "@adobe/react-spectrum"

import OpenButton from "./OpenButton"

import { useRoot } from "../store"

export default function BgmActionGroup() {
    const [root, dispatch] = useRoot()
    const isDocOpen = root.activeDocId !== undefined

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
                // TODO
            }}
            isDisabled={!isDocOpen}
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
