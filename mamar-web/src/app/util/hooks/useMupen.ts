import createMupen64PlusWeb, { EmulatorControls } from "mupen64plus-web"
import { useEffect, useRef, useState } from "react"
import Stats from "stats.js"

enum State {
    MOUNTING,
    LOADING,
    STARTED,
    READY,
    RELOADING,
}

const stats = new Stats()
stats.showPanel(0)
stats.dom.style.top = "auto"
stats.dom.style.bottom = "0"

export default function useMupen(romData: ArrayBuffer | undefined, vi: () => void): EmulatorControls | undefined {
    const [mupen, setMupen] = useState<EmulatorControls>()
    const [error, setError] = useState<any>()
    const state = useRef(State.MOUNTING)

    const viRef = useRef(vi)
    viRef.current = vi

    useEffect(() => {
        if (!romData) {
            mupen?.pause?.()
            return
        }

        switch (state.current) {
        case State.MOUNTING:
            // Load the emulator
            state.current = State.LOADING
            let module: any
            createMupen64PlusWeb({
                canvas: document.getElementById("canvas") as HTMLCanvasElement,
                romData,
                beginStats: () => stats.begin(),
                endStats: () => {
                    stats.end()
                    viRef.current()
                },
                coreConfig: {
                    emuMode: 0,
                },
                locateFile(path: string, prefix: string) {
                    if (path.endsWith(".wasm") || path.endsWith(".data")) {
                        return "/mupen64plus-web/" + path
                    }

                    return prefix + path
                },
                setErrorStatus(errorMessage) {
                    if (state.current === State.LOADING) {
                        setError(errorMessage)
                    }
                },
                // @ts-ignore
                preRun: [m => {
                    module = m
                }],
            }).then(async mupen => {
                if (mupen) {
                    await mupen.start()
                    state.current = State.STARTED
                    document.body.appendChild(stats.dom)
                    setMupen(mupen)
                    module.JSEvents.removeAllEventListeners()
                }
            }).catch(error => {
                // XXX: mupen64plus-web never rejects, it just calls setErrorStatus
                setError(error)
            })
            break
        case State.STARTED:
            state.current = State.READY
            break
        case State.READY:
            if (!mupen)
                break
            console.log("reloading ROM")
            state.current = State.RELOADING

            // Emulator must be running to reload rom
            mupen.resume()
                .then(() => new Promise(r => setTimeout(r, 100)))
                .then(() => mupen.reloadRom(romData))
                .finally(() => {
                    console.log("rom reload complete")
                    state.current = State.READY
                })
            break
        case State.RELOADING:
            console.warn("ignoring ROM reload, already reloading")
            break
        }
    }, [mupen, romData])

    window.MUPEN = mupen

    if (error) {
        throw error
    }

    return mupen
}
