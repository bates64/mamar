import { Provider as SpectrumProvider, Grid, View } from "@adobe/react-spectrum"
import { useEffect } from "react"

import styles from "./App.module.scss"
import { PlayheadContextProvider } from "./doc/Playhead"
import MupenSongPlayerProvider from "./emu/MupenSongPlayer"
import PlaybackControls from "./emu/PlaybackControls"
import Header from "./header/Header"
import Main from "./Main"
import { RootProvider } from "./store/dispatch"
import { mochaTheme } from "./theme"
import useDxRom, { DxRomProvider } from "./util/hooks/useDxRom"
import { MupenProvider } from "./util/hooks/useMupen"
import { RomDataProvider } from "./util/hooks/useRomData"

import { version } from "../../package.json"

function DxRomConsumer() {
    const { rom, symbols } = useDxRom()

    return <MupenProvider romData={rom}>
        <MupenSongPlayerProvider symbols={symbols}>
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
        </MupenSongPlayerProvider>
    </MupenProvider>
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
                <RomDataProvider>
                    <DxRomProvider>
                        <DxRomConsumer />
                    </DxRomProvider>
                </RomDataProvider>
            </View>
        </SpectrumProvider>
    </RootProvider>
}
