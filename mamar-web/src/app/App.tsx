import { Provider as SpectrumProvider, Grid, View } from "@adobe/react-spectrum"
import { useEffect, useMemo } from "react"

import styles from "./App.module.scss"
import { PlayheadContextProvider } from "./doc/Playhead"
import PlaybackControls from "./emu/PlaybackControls"
import { SongPlayerContext } from "./emu/SongPlayer"
import WasmSongPlayer from "./emu/WasmSongPlayer"
import Header from "./header/Header"
import Main from "./Main"
import { RootProvider } from "./store/dispatch"
import { mochaTheme } from "./theme"
import useSoundBank, { SoundBankProvider } from "./util/hooks/useSoundBank"

import { version } from "../../package.json"

function Editor() {
    const sbn = useSoundBank()
    const player = useMemo(() => new WasmSongPlayer(sbn), [sbn])

    return <SongPlayerContext.Provider value={player}>
        <Grid
            areas={[
                "header",
                "content",
            ]}
            columns={["1fr"]}
            rows={["auto", "1fr"]}
            height="100vh"
        >
            <PlayheadContextProvider>
                <View gridArea="header">
                    <Header />
                </View>
                <div className={styles.playbackControlsContainer}>
                    <PlaybackControls />
                </div>
                <View gridArea="content" UNSAFE_style={{ minHeight: 0 }}>
                    <Main />
                </View>
            </PlayheadContextProvider>
        </Grid>
    </SongPlayerContext.Provider>
}

export default function App() {
    useEffect(() => {
        localStorage.MAMAR_VERSION = version
    }, [])

    useEffect(() => {
        if ("windowControlsOverlay" in navigator) {
            const { windowControlsOverlay } = navigator as any

            const update = () => {
                const { width } = windowControlsOverlay.getTitlebarAreaRect()

                if (width > 0) {
                    document.body.classList.add("window-controls-overlay")
                } else {
                    document.body.classList.remove("window-controls-overlay")
                }
            }

            update()

            windowControlsOverlay.addEventListener("geometrychange", update)
            return () => windowControlsOverlay.removeEventListener("geometrychange", update)
        }
    }, [])

    return <RootProvider>
        <SpectrumProvider theme={mochaTheme} colorScheme="dark">
            <View UNSAFE_className="App">
                <SoundBankProvider>
                    <Editor />
                </SoundBankProvider>
            </View>
        </SpectrumProvider>
    </RootProvider>
}
