import { DialogContainer } from "@react-spectrum/dialog"
import { del, get, set } from "idb-keyval"
import { useEffect, ReactNode, useState, useContext, createContext } from "react"

import PaperMarioRomInputDialog from "../../emu/PaperMarioRomInputDialog"
import { findSoundBank } from "../soundBank"

/** The sound bank (SBN) of the ROM whose instruments songs play with. */
export const SoundBankContext = createContext<ArrayBuffer | null>(null)

/** Loads the sound bank of the ROM the user gave, asking for a ROM if they haven't given one. */
async function loadSoundBank(): Promise<ArrayBuffer | null> {
    const saved = await get("sbn")
    if (saved instanceof ArrayBuffer) {
        return saved
    }

    // Mamar used to save the whole ROM
    const rom = await get("rom_papermario_us")
    if (rom instanceof ArrayBuffer) {
        const sbn = findSoundBank(rom)
        if (sbn) {
            await set("sbn", sbn)
            await del("rom_papermario_us")
        }
        return sbn
    }
    return null
}

export function SoundBankProvider({ children }: { children: ReactNode }) {
    const [value, setValue] = useState<ArrayBuffer | null>(null)
    const [isLoaded, setIsLoaded] = useState(false)

    useEffect(() => {
        loadSoundBank().then(sbn => {
            setValue(sbn)
            setIsLoaded(true)
        })
    }, [])

    const onChange = (sbn: ArrayBuffer) => {
        set("sbn", sbn)
        setValue(sbn)
    }

    return <SoundBankContext.Provider value={value}>
        <DialogContainer onDismiss={() => {}} isDismissable={false} isKeyboardDismissDisabled={true}>
            {!value && isLoaded && <PaperMarioRomInputDialog onChange={onChange} />}
        </DialogContainer>

        {value && children}
    </SoundBankContext.Provider>
}

/** The sound bank (SBN) of the user's Paper Mario ROM. */
export default function useSoundBank(): ArrayBuffer {
    const value = useContext(SoundBankContext)

    if (!value) {
        throw new Error("useSoundBank must be used within a SoundBankProvider")
    }

    return value
}

/** The sound bank of the user's ROM, or null outside a SoundBankContext. */
export function useOptionalSoundBank(): ArrayBuffer | null {
    return useContext(SoundBankContext)
}
