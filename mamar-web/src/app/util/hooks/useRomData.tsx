import { DialogContainer } from "@react-spectrum/dialog"
import { get, set } from "idb-keyval"
import { useEffect, ReactNode, useState, useContext, createContext } from "react"

import PaperMarioRomInputDialog, { isPaperMario } from "../../emu/PaperMarioRomInputDialog"

const romData = createContext<ArrayBuffer | null>(null)

export function RomDataProvider({ children }: { children: ReactNode }) {
    const [value, setValue] = useState<ArrayBuffer | null>(null)
    const [isLoaded, setIsLoaded] = useState(false)

    useEffect(() => {
        get("rom_papermario_us").then(data => {
            if (romData && isPaperMario(data)) {
                setValue(data)
            }

            setIsLoaded(true)
        })
    }, [])

    useEffect(() => {
        if (value) {
            set("rom_papermario_us", value)
        }
    }, [value])

    return <romData.Provider value={value}>
        <DialogContainer onDismiss={() => {}} isDismissable={false} isKeyboardDismissDisabled={true}>
            {!value && isLoaded && <PaperMarioRomInputDialog onChange={setValue} />}
        </DialogContainer>

        {value && children}
    </romData.Provider>
}

export default function useRomData() {
    const value = useContext(romData)

    if (!value) {
        throw new Error("useRomData must be used within a RomDataProvider")
    }

    return value
}
