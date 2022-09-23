import createMupen64PlusWeb, { EmulatorControls } from "mupen64plus-web"
import { useEffect, useRef, useState } from "react"

enum State {
    MOUNTING,
    LOADING,
    STARTED,
    READY,
    RELOADING,
}

export default function useMupen(romData: ArrayBuffer | undefined): EmulatorControls | undefined {
    const [mupen, setMupen] = useState<EmulatorControls>()
    const [error, setError] = useState<any>()
    const state = useRef(State.MOUNTING)

    useEffect(() => {
        if (!romData) {
            mupen?.pause?.()
            return
        }

        switch (state.current) {
        case State.MOUNTING:
            // Load the emulator
            state.current = State.LOADING
            createMupen64PlusWeb({
                canvas: document.getElementById("canvas") as HTMLCanvasElement,
                romData,
                beginStats: () => {},
                endStats: () => {},
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
            }).then(async mupen => {
                if (mupen) {
                    await mupen.start()
                    state.current = State.STARTED
                    setMupen(mupen)
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

    if (error) {
        throw error
    }

    return mupen
}
