import { ActionButton, AlertDialog, DialogContainer } from "@adobe/react-spectrum"
import { fileOpen } from "browser-fs-access"
import { useState } from "react"

import { useRoot } from "../store"
import { openFile } from "../store/root"

export default function OpenButton() {
    const [, dispatch] = useRoot()
    const [loadError, setLoadError] = useState<Error | null>(null)

    return <>
        <ActionButton
            onPress={async () => {
                const file = await fileOpen({
                    extensions: [".bgm", ".mid", ".midi", ".rmi", ".bin"],
                    description: "BGM and MIDI files",
                    id: "bgm_open",
                })

                try {
                    const action = await openFile(file)
                    dispatch(action)
                } catch (error) {
                    console.error(error)
                    if (error instanceof Error) {
                        setLoadError(error)
                    }
                }
            }}
            isQuiet
        >Open</ActionButton>

        <DialogContainer onDismiss={() => setLoadError(null)}>
            {loadError && <AlertDialog
                title="Error opening file"
                variant="error"
                primaryActionLabel="OK"
            >
                Failed to decode the BGM.<br />
                <pre>{loadError.message}</pre>
            </AlertDialog>}
        </DialogContainer>
    </>
}
