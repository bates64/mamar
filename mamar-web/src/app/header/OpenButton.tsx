import { ActionButton, AlertDialog, DialogContainer } from "@adobe/react-spectrum"
import { fileOpen, FileWithHandle } from "browser-fs-access"
import { MidiMapping } from "pm64-typegen"
import { useCallback, useEffect, useState } from "react"

import MidiImportDialog from "./MidiImportDialog"

import { sampleReach } from "../doc/pitchLimit"
import { useRoot } from "../store"
import { isMidi, openFile, RootAction } from "../store/root"
import { useOptionalSoundBank } from "../util/hooks/useSoundBank"

/** A MIDI file waiting on how to read it, and what to do with the answer, which is null if the import is cancelled. */
interface Asking {
    name: string
    answer(mapping: MidiMapping | null): void
}

export default function OpenButton() {
    const [, dispatch] = useRoot()
    const sbn = useOptionalSoundBank()
    const [loadError, setLoadError] = useState<Error | null>(null)
    const [asking, setAsking] = useState<Asking | null>(null)

    // Opens `file`, asking how to read it first if it's a MIDI file. Returns null if the import is cancelled.
    const open = useCallback(async (file: FileWithHandle): Promise<RootAction | null> => {
        let mapping: MidiMapping | undefined
        if (isMidi(new Uint8Array(await file.slice(0, 4).arrayBuffer()))) {
            const answer = await new Promise<MidiMapping | null>(resolve => setAsking({ name: file.name, answer: resolve }))
            setAsking(null)
            if (!answer) {
                return null
            }
            mapping = answer
        }
        return openFile(file, sbn, mapping, sbn ? sampleReach(sbn) : undefined)
    }, [sbn])

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
                    const action = await open(file)
                    if (action) {
                        actions.push(action)
                    }
                }

                dispatch(...actions)
            })
        }
    }, [dispatch, open])

    return <>
        <ActionButton
            onPress={async () => {
                const file = await fileOpen({
                    extensions: [".bgm", ".mid", ".midi", ".rmi", ".bin", ".ron"],
                    description: "BGM and MIDI files",
                    id: "bgm_open",
                })

                try {
                    const action = await open(file)
                    if (action) {
                        dispatch(action)
                    }
                } catch (error) {
                    console.error(error)
                    if (error instanceof Error) {
                        setLoadError(error)
                    }
                }
            }}
            isQuiet
        >Open</ActionButton>

        <DialogContainer onDismiss={() => asking?.answer(null)}>
            {asking && <MidiImportDialog
                name={asking.name}
                onImport={mapping => asking.answer(mapping)}
                onCancel={() => asking.answer(null)}
            />}
        </DialogContainer>

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
