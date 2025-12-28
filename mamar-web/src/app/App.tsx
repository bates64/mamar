import { Provider as SpectrumProvider, defaultTheme, Grid, View } from "@adobe/react-spectrum"
import { useEffect } from "react"

import styles from "./App.module.scss"
import PlaybackControls from "./emu/PlaybackControls"
import Header from "./header/Header"
import Main from "./Main"
import { RootProvider } from "./store/dispatch"
import { MupenProvider } from "./util/hooks/useMupen"
import useRomData, { RomDataProvider } from "./util/hooks/useRomData"

import { version } from "../../package.json"

export function RomDataConsumer() {
    const romData = useRomData()

    return <MupenProvider romData={romData}>
        <Grid
            areas={[
                "header",
                "content",
            ]}
            columns={["1fr"]}
            rows={["auto", "1fr"]}
            height="100vh"
        >
            <View gridArea="header">
                <Header />
            </View>
            <div className={styles.playbackControlsContainer}>
                <PlaybackControls />
            </div>
            <View gridArea="content">
                <Main />
            </View>
        </Grid>
    </MupenProvider>
}

export default function App() {
    useEffect(() => {
        localStorage.MAMAR_VERSION = version
    }, [])

    useEffect(() => {
        const query = () => window.matchMedia("(prefers-color-scheme: light)")
        const update = () => {
            document.querySelector("meta[name=theme-color]")!.setAttribute("content", query().matches ? "#ffffff" : "#111111")
        }

        update()

        const q = query()
        q.addEventListener("change", update)
        return () => q.removeEventListener("change", update)
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
        <SpectrumProvider theme={defaultTheme}>
            <View UNSAFE_className="App">
                <RomDataProvider>
                    <RomDataConsumer />
                </RomDataProvider>
            </View>
        </SpectrumProvider>
    </RootProvider>
}
