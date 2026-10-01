import { ActionButton, AlertDialog, DialogContainer } from "@adobe/react-spectrum"
import { fileOpen } from "browser-fs-access"
import { useEffect, useState } from "react"

import { useRoot } from "../store"
import { openFile, RootAction } from "../store/root"
import { useOptionalSoundBank } from "../util/hooks/useSoundBank"

export default function OpenButton() {
    const [, dispatch] = useRoot()
    const sbn = useOptionalSoundBank()
    const [loadError, setLoadError] = useState<Error | null>(null)

    useEffect(() => {
        // @ts-ignore
        if ("launchQueue" in window && "files" in LaunchParams.prototype) {

            // @ts-ignore
            launchQueue.setConsumer(async launchParams => {
                const actions: RootAction[] = []

                for (const handle of launchParams.files) {
                    const file = await handle.getFile()
                    // Kept so a song made from a MIDI file can be reimported from it
                    file.handle = handle
                    const action = await openFile(file, sbn)
                    actions.push(action)
                }

                dispatch(...actions)
            })
        }
    }, [dispatch, sbn])

    return <>
        <ActionButton
            onPress={async () => {
                const file = await fileOpen({
                    extensions: [".bgm", ".mid", ".midi", ".rmi", ".bin", ".ron"],
                    description: "BGM and MIDI files",
                    id: "bgm_open",
                })

                try {
                    const action = await openFile(file, sbn)
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
