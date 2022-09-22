import { get, set } from "idb-keyval"
import { useEffect } from "react"

function getRomName(romData: ArrayBuffer) {
    const romName = new Uint8Array(romData, 0x20, 20)
    return String.fromCharCode(...romName)
}

function isPaperMario(romData: ArrayBuffer) {
    return getRomName(romData) === "PAPER MARIO         "
}

export interface Props {
    onChange: (romData: ArrayBuffer) => void
}

export default function PaperMarioRomInput({ onChange }: Props) {
    useEffect(() => {
        get("rom_papermario_us").then(romData => {
            if (romData && isPaperMario(romData)) {
                onChange(romData)
            }
        })
    }, [onChange])

    return <input
        aria-label="Paper Mario ROM"
        type="file"
        onChange={async evt => {
            const file = (evt.target as HTMLInputElement).files?.[0]
            const rom = await file?.arrayBuffer()

            if (!rom || isPaperMario(rom)) {
                alert("This is not a Paper Mario ROM!")
                return
            }

            onChange(rom)
            await set("rom_papermario_us", rom)
        }}
    />
}
