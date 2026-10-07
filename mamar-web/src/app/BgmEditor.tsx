import { DialogContainer, Provider as SpectrumProvider } from "@adobe/react-spectrum"
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"

import styles from "./BgmEditor.module.scss"
import { ensureBridge } from "./bridge"
import ActiveDoc from "./doc/ActiveDoc"
import { PlayheadContextProvider } from "./doc/Playhead"
import PlaybackControls from "./emu/PlaybackControls"
import { SongPlayer, SongPlayerContext } from "./emu/SongPlayer"
import ErrorBoundaryView from "./ErrorBoundaryView"
import { ExportDialog } from "./header/ExportButton"
import { ReimportResult, useReimport } from "./header/ReimportButton"
import { useRoot } from "./store"
import { RootProvider } from "./store/dispatch"
import { openData } from "./store/root"
import { mochaTheme } from "./theme"
import { SoundBankContext } from "./util/hooks/useSoundBank"
import { encodeToSave } from "./util/recordings"

import "./colors.scss"

export interface BgmEditorHandle {
    /** Encodes the song and marks it as saved. */
    save(): Uint8Array
    undo(): void
    redo(): void
    /** Opens the dialog that exports the song as an audio file. */
    exportAudio(): void
    /** Whether the song was made from a MIDI file, which it can be reimported from. */
    canReimport(): boolean
    /**
     * Reimports the MIDI file the song was made from, keeping what was changed in Mamar. It reads the file it last
     * read, or asks for one if `pick` is set or that file can't be read. A dialog in the editor shows what went wrong.
     */
    reimport(pick: boolean): Promise<ReimportResult>
}

export interface BgmEditorProps {
    /** The encoded BGM to edit. Changing it after the first render does nothing. */
    data: Uint8Array
    /** The sound bank (SBN) of the ROM whose instruments the song plays with, as findSoundBank finds it. */
    soundBank: ArrayBuffer
    player: SongPlayer
    /** Called when the song gains or loses unsaved changes. */
    onDirtyChange?: (dirty: boolean) => void
}

/**
 * Edits one song. Space plays and stops it while focus is inside the editor, and Shift+Space continues from where it stopped.
 */
const BgmEditor = forwardRef<BgmEditorHandle, BgmEditorProps>(function BgmEditor(props, ref) {
    const [isBridgeLoaded, setIsBridgeLoaded] = useState(false)

    useEffect(() => {
        ensureBridge().then(() => setIsBridgeLoaded(true))
    }, [])

    return <SpectrumProvider theme={mochaTheme} colorScheme="dark" UNSAFE_className={styles.editor}>
        {isBridgeLoaded && <RootProvider>
            <SoundBankContext.Provider value={props.soundBank}>
                <SongPlayerContext.Provider value={props.player}>
                    <PlayheadContextProvider>
                        <Editor ref={ref} {...props} />
                    </PlayheadContextProvider>
                </SongPlayerContext.Provider>
            </SoundBankContext.Provider>
        </RootProvider>}
    </SpectrumProvider>
})

export default BgmEditor

const Editor = forwardRef<BgmEditorHandle, BgmEditorProps>(function Editor({ data, soundBank, onDirtyChange }, ref) {
    const [root, dispatch] = useRoot()
    const docId = root.activeDocId
    const doc = docId ? root.docs[docId] : undefined

    useEffect(() => {
        dispatch(openData(data, undefined, true, soundBank))
    // Opens the song once, when the editor mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const [isExporting, setExporting] = useState(false)
    const { reimport, dialog: reimportDialog } = useReimport()

    const latest = useRef({ doc, dispatch, reimport, soundBank })
    latest.current = { doc, dispatch, reimport, soundBank }

    useImperativeHandle(ref, () => ({
        save() {
            const { doc, dispatch, soundBank } = latest.current
            if (!doc) {
                throw new Error("No song is open")
            }
            const bgmBin = encodeToSave(doc.bgm, doc.importBase, soundBank)
            dispatch({ type: "doc", id: doc.id, action: { type: "mark_saved" } })
            return bgmBin
        },
        undo() {
            latest.current.dispatch.undo()
        },
        redo() {
            latest.current.dispatch.redo()
        },
        exportAudio() {
            setExporting(true)
        },
        canReimport() {
            return !!latest.current.doc?.bgm.import
        },
        reimport(pick) {
            return latest.current.reimport(pick)
        },
    }), [])

    const isDirty = doc ? !doc.isSaved : false
    useEffect(() => {
        onDirtyChange?.(isDirty)
    }, [onDirtyChange, isDirty])

    return <div className={styles.layout} data-bgm-editor tabIndex={-1}>
        <PlaybackControls />
        <ErrorBoundaryView UNSAFE_className={styles.doc}>
            {doc && <ActiveDoc />}
        </ErrorBoundaryView>
        <DialogContainer onDismiss={() => setExporting(false)}>
            {isExporting && <ExportDialog close={() => setExporting(false)} />}
        </DialogContainer>
        {reimportDialog}
    </div>
})
