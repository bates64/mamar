import { createContext, ReactNode, useContext, useEffect, useState } from "react"

import useRomData from "./useRomData"

import { loading } from "../.."
import { MAMAR_SYMBOL_NAMES, MamarSymbols } from "../../emu/DxMamar"
import applyBps from "../bps"

/**
 * Where papermario-dx's CI publishes a patch that turns the vanilla ROM into a dx build, and the addresses of the
 * globals Mamar plays songs through in that build.
 */
const DX_BASE_URL = "/dx"

export interface DxRom {
    rom: ArrayBuffer
    symbols: MamarSymbols
}

async function loadDxRom(vanilla: ArrayBuffer): Promise<DxRom> {
    const [published, patch] = await Promise.all([
        fetch(`${DX_BASE_URL}/symbols.json`, { cache: "no-cache" }).then(response => response.json()),
        fetch(`${DX_BASE_URL}/papermario.bps`, { cache: "no-cache" }).then(response => response.arrayBuffer()),
    ])

    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", patch))
    const sha256 = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("")
    if (sha256 !== published.patchSha256) {
        throw new Error("The game's files changed while they were downloading. Reload the page to try again.")
    }

    const missing = MAMAR_SYMBOL_NAMES.filter(name => typeof published.symbols[name] !== "number")
    if (missing.length > 0) {
        throw new Error(`The game is missing ${missing.join(", ")}`)
    }

    const rom = applyBps(new Uint8Array(vanilla), new Uint8Array(patch))
    return { rom: rom.buffer as ArrayBuffer, symbols: published.symbols }
}

const dxRomContext = createContext<DxRom | null>(null)

/** Turns the vanilla ROM into a papermario-dx ROM, which plays Mamar's songs. */
export function DxRomProvider({ children }: { children: ReactNode }) {
    const vanilla = useRomData()
    const [value, setValue] = useState<DxRom | null>(null)
    const [error, setError] = useState<unknown>()

    useEffect(() => {
        setValue(null)
        loadDxRom(vanilla).then(setValue, setError)
    }, [vanilla])

    if (error) {
        throw error
    }

    if (!value) {
        return loading
    }

    return <dxRomContext.Provider value={value}>
        {children}
    </dxRomContext.Provider>
}

export default function useDxRom(): DxRom {
    const value = useContext(dxRomContext)

    if (!value) {
        throw new Error("useDxRom must be used within a DxRomProvider")
    }

    return value
}
