import { EmulatorControls } from "mupen64plus-web"
import { ReactNode, useMemo } from "react"

import DxMamar, { EmulatorMemory, MamarSymbols } from "./DxMamar"
import DxSongPlayer from "./DxSongPlayer"
import { SongPlayerContext } from "./SongPlayer"

import useMupen from "../util/hooks/useMupen"

/** RDRAM, which mupen64plus-web stores with each 32-bit word's bytes reversed. */
function mupenMemory(emu: EmulatorControls): EmulatorMemory {
    const index = (address: number) => (address & 0x00FFFFFF) ^ 3

    return {
        async read(address, size) {
            const dram = emu.getDram()
            const data = new Uint8Array(size)
            for (let i = 0; i < size; i++) {
                data[i] = dram[index(address + i)]
            }
            return data
        },
        write(address, data) {
            const dram = emu.getDram()
            for (let i = 0; i < data.length; i++) {
                dram[index(address + i)] = data[i]
            }
        },
    }
}

export default function MupenSongPlayerProvider({ symbols, children }: { symbols: MamarSymbols, children: ReactNode }) {
    const { emu } = useMupen()
    const player = useMemo(() => new DxSongPlayer(DxMamar.connect(mupenMemory(emu), symbols)), [emu, symbols])

    return <SongPlayerContext.Provider value={player}>
        {children}
    </SongPlayerContext.Provider>
}
