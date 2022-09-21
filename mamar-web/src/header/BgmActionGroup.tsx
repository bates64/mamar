import { View, ActionButton } from "@adobe/react-spectrum"
import { fileOpen } from "browser-fs-access"

import { useRoot, openDoc, RootAction } from "../store"

export default function BgmActionGroup() {
    const [root, dispatch] = useRoot()
    const isDocOpen = root.activeDocId !== undefined

    const props = {
        isQuiet: true,
    }

    return <View>
        <ActionButton
            onPress={() => dispatch({ type: "new_doc" })}
            {...props}
        >New</ActionButton>
        <ActionButton
            onPress={async () => {
                const file = await fileOpen({
                    extensions: [".bgm", ".bin", ".midi", ".mid"],
                    description: "BGM files",
                    id: "bgm_open",
                })

                let action: RootAction
                try {
                    action = await openDoc(file)
                } catch (error) {
                    // TODO: use a dialog or something
                    alert(error)
                    throw error
                }
                dispatch(action)
            }}
            {...props}
        >Open</ActionButton>
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
