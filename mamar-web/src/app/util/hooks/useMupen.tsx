import createMupen64PlusWeb, { EmulatorControls } from "mupen64plus-web"
import { useEffect, useRef, useState, useContext, createContext, ReactNode, MutableRefObject } from "react"

import { loading } from "../.."

enum State {
    MOUNTING,
    LOADING,
    STARTED,
    READY,
    RELOADING,
}

type ViFn = (emu: EmulatorControls) => void

interface Context {
    emu: EmulatorControls
    viRef: MutableRefObject<ViFn[]>
}

const mupenCtx = createContext<Context | null>(null)

export function MupenProvider({ romData, children }: { romData: ArrayBuffer, children: ReactNode }) {
    const [emu, setEmu] = useState<EmulatorControls>()
    const [error, setError] = useState<any>()
    const state = useRef(State.MOUNTING)
    const viRef = useRef<ViFn[]>([])

    useEffect(() => {
        if (!romData) {
            emu?.pause?.()
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
                beginStats: () => {},
                endStats: () => {
                    if (emu) {
                        for (const cb of viRef.current) {
                            cb(emu)
                        }
                    }
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
                    setEmu(mupen)
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
            if (!emu)
                break
            console.log("reloading ROM")
            state.current = State.RELOADING

            // Emulator must be running to reload rom
            emu.resume()
                .then(() => new Promise(r => setTimeout(r, 100)))
                .then(() => emu.reloadRom(romData))
                .finally(() => {
                    console.log("rom reload complete")
                    state.current = State.READY
                })
            break
        case State.RELOADING:
            console.warn("ignoring ROM reload, already reloading")
            break
        }
    }, [emu, romData])

    if (error) {
        throw error
    }

    if (!emu) {
        return loading
    }

    return <mupenCtx.Provider value={{ emu, viRef }}>
        {children}
    </mupenCtx.Provider>
}

export default function useMupen(vi?: ViFn): Context {
    const ctx = useContext(mupenCtx)

    if (!ctx) {
        throw new Error("useMupen must be used within a MupenProvider")
    }

    useEffect(() => {
        if (!vi)
            return

        ctx.viRef.current.push(vi)

        return () => {
            ctx.viRef.current = ctx.viRef.current.filter(cb => cb !== vi)
        }
    }, [ctx, vi])

    return ctx
}
