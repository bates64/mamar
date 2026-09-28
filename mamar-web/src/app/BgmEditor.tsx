import { Provider as SpectrumProvider } from "@adobe/react-spectrum"
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"

import styles from "./BgmEditor.module.scss"
import Bridge, { ensureBridge } from "./bridge"
import ActiveDoc from "./doc/ActiveDoc"
import { PlayheadContextProvider } from "./doc/Playhead"
import PlaybackControls from "./emu/PlaybackControls"
import { SongPlayer, SongPlayerContext } from "./emu/SongPlayer"
import ErrorBoundaryView from "./ErrorBoundaryView"
import { useRoot } from "./store"
import { RootProvider } from "./store/dispatch"
import { openData } from "./store/root"
import { mochaTheme } from "./theme"

import "./colors.scss"

export interface BgmEditorHandle {
    /** Encodes the song and marks it as saved. */
    save(): Uint8Array
    undo(): void
    redo(): void
}

export interface BgmEditorProps {
    /** The encoded BGM to edit. Changing it after the first render does nothing. */
    data: Uint8Array
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
            <SongPlayerContext.Provider value={props.player}>
                <PlayheadContextProvider>
                    <Editor ref={ref} {...props} />
                </PlayheadContextProvider>
            </SongPlayerContext.Provider>
        </RootProvider>}
    </SpectrumProvider>
})

export default BgmEditor

const Editor = forwardRef<BgmEditorHandle, BgmEditorProps>(function Editor({ data, onDirtyChange }, ref) {
    const [root, dispatch] = useRoot()
    const docId = root.activeDocId
    const doc = docId ? root.docs[docId] : undefined

    useEffect(() => {
        dispatch(openData(data, undefined, true))
    // Opens the song once, when the editor mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const latest = useRef({ doc, dispatch })
    latest.current = { doc, dispatch }

    useImperativeHandle(ref, () => ({
        save() {
            const { doc, dispatch } = latest.current
            if (!doc) {
                throw new Error("No song is open")
            }
            const bgmBin: Uint8Array | string = Bridge.bgm_encode(doc.bgm)
            if (typeof bgmBin === "string") {
                throw new Error(bgmBin)
            }
            dispatch({ type: "doc", id: doc.id, action: { type: "mark_saved" } })
            return bgmBin
        },
        undo() {
            latest.current.dispatch.undo()
        },
        redo() {
            latest.current.dispatch.redo()
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
    </div>
})
