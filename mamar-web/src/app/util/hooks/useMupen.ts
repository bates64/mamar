import createMupen64PlusWeb, { EmulatorControls } from "mupen64plus-web"
import { useEffect, useRef, useState } from "react"

export default function useMupen(romData: ArrayBuffer | undefined): EmulatorControls | undefined {
    const [mupen, setMupen] = useState<EmulatorControls>()
    const busy = useRef(false)

    useEffect(() => {
        if (romData && !mupen && !busy.current) {
            busy.current = true
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
                setErrorState() {},
            }).then(async mupen => {
                await mupen.start()
                setMupen(mupen)
            })
        }
    }, [mupen, romData])

    return mupen
}
