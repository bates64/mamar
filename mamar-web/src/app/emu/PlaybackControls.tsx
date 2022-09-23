import { ActionButton, Flex, ToggleButton, View } from "@adobe/react-spectrum"
import Play from "@spectrum-icons/workflow/Play"
import { bgm_encode } from "mamar-wasm-bridge"
import { EmulatorControls } from "mupen64plus-web"
import * as patches from "patches"
import { Bgm } from "pm64-typegen"
import { useEffect, useRef, useState } from "react"

import { useBgm } from "../store"
import useMupen from "../util/hooks/useMupen"
import useRomData from "../util/hooks/useRomData"

import "./PlaybackControls.scss"

class DramView {
    u8: Uint8Array

    constructor(mupen: EmulatorControls) {
        this.u8 = mupen.getDram()
    }

    readU8(address: number) {
        address = address & 0x00FFFFFF
        return this.u8[address]
    }

    writeU8(address: number, data: Uint8Array | number) {
        address = address & 0x00FFFFFF
        if (typeof data === "number") {
            this.u8[address] = data
        } else {
            for (let i = 0; i < data.length; i++) {
                this.u8[address + i] = data[i]
            }
        }
    }

    readU32(address: number) {
        address = address & 0x00FFFFFF
        return this.u8[address] | (this.u8[address + 1] << 8) | (this.u8[address + 2] << 16) | (this.u8[address + 3] << 24)
    }

    readU32Byteswapped(address: number) {
        address = address & 0x00FFFFFF
        return (this.u8[address] << 24) | (this.u8[address + 1] << 16) | (this.u8[address + 2] << 8) | this.u8[address + 3]
    }

    writeU32Byteswapped(address: number, data: Uint8Array | number) {
        address = address & 0x00FFFFFF

        if (typeof data === "number") {
            this.u8[address] = (data >> 24) & 0xFF
            this.u8[address + 1] = (data >> 16) & 0xFF
            this.u8[address + 2] = (data >> 8) & 0xFF
            this.u8[address + 3] = data & 0xFF
        } else {
            // Convert to Uint32Array
            if (data.length % 4 !== 0) {
                throw new Error("data length must be a multiple of 4")
            }
            const u32 = new Uint32Array(data.length / 4)

            for (let i = 0; i < u32.length; i++) {
                u32[i] = (data[i * 4] << 24)
                    | (data[i * 4 + 1] << 16)
                    | (data[i * 4 + 2] << 8)
                    | data[i * 4 + 3]
            }

            // Byte swap
            for (let i = 0; i < u32.length; i++) {
                u32[i] = ((u32[i] & 0xff000000) >> 24) | ((u32[i] & 0x00ff0000) >> 8) | ((u32[i] & 0x0000ff00) << 8) | ((u32[i] & 0x000000ff) << 24)
            }

            // Write u32
            for (let i = 0; i < u32.length; i++) {
                this.u8[address + i * 4] = (u32[i] >> 24) & 0xFF
                this.u8[address + i * 4 + 1] = (u32[i] >> 16) & 0xFF
                this.u8[address + i * 4 + 2] = (u32[i] >> 8) & 0xFF
                this.u8[address + i * 4 + 3] = u32[i] & 0xFF
            }
        }
    }

    writeU32(address: number, data: Uint32Array | number) {
        address = address & 0x00FFFFFF
        if (typeof data === "number") {
            this.u8[address] = data & 0xFF
            this.u8[address + 1] = (data >> 8) & 0xFF
            this.u8[address + 2] = (data >> 16) & 0xFF
            this.u8[address + 3] = (data >> 24) & 0xFF
        } else {
            for (let i = 0; i < data.length; i++) {
                this.u8[address + i * 4] = data[i] & 0xFF
                this.u8[address + i * 4 + 1] = (data[i] >> 8) & 0xFF
                this.u8[address + i * 4 + 2] = (data[i] >> 16) & 0xFF
                this.u8[address + i * 4 + 3] = (data[i] >> 24) & 0xFF
            }
        }
    }
}

function writePatches(mupen: EmulatorControls) {
    const dram = new DramView(mupen)

    dram.writeU32(patches.RAM_state_step_logos, patches.ASM_PATCH_state_step_logos)
    dram.writeU32(patches.RAM_PATCH_state_step_logos, patches.ASM_PATCH_state_step_logos)

    dram.writeU32(patches.RAM_state_step_title_screen, patches.ASM_PATCH_state_step_title_screen)
    dram.writeU32(patches.RAM_PATCH_state_step_title_screen, patches.ASM_PATCH_state_step_title_screen)

    dram.writeU32(patches.RAM_appendGfx_title_screen, patches.ASM_PATCH_appendGfx_title_screen)
    dram.writeU32(patches.RAM_PATCH_appendGfx_title_screen, patches.ASM_PATCH_appendGfx_title_screen)

    dram.writeU32(patches.RAM_au_load_song_files, patches.ASM_PATCH_au_load_song_files)
    dram.writeU32(patches.RAM_PATCH_au_load_song_files, patches.ASM_PATCH_au_load_song_files)

    dram.writeU32(patches.RAM_MAMAR_au_load_song_files, patches.ASM_MAMAR_au_load_song_files)
}

let songId = 0

function writeBgm(mupen: EmulatorControls, bgm: Bgm) {
    const bgmBin: Uint8Array | string = bgm_encode(bgm)

    if (bgmBin instanceof Uint8Array) {
        const dram = new DramView(mupen)

        if (bgmBin.length > 0x20000) {
            throw new Error(`Encoded BGM too large, ${bgmBin.length} > 0x20000 bytes`)
        }

        console.log(`Writing BGM to ${patches.RAM_MAMAR_bgm.toString(16)}`)
        dram.writeU32Byteswapped(patches.RAM_MAMAR_bgm, bgmBin)
        dram.writeU32(patches.RAM_MAMAR_bgm_size, bgmBin.length)
        dram.writeU32(patches.RAM_MAMAR_bk_files, new Uint32Array([0, 0, 0]))
        dram.writeU32(patches.RAM_MAMAR_song_id, songId++)
        dram.writeU32(patches.RAM_MAMAR_song_variation, 0)
        dram.writeU32(patches.RAM_MAMAR_ambient_sounds, 6) // AMBIENT_SILENCE
    } else {
        throw new Error(bgmBin)
    }
}

export default function PlaybackControls() {
    const [bgm] = useBgm()
    const [isPlaying, setIsPlaying] = useState(false)
    const romData = useRomData()
    const bpmRef = useRef<HTMLSpanElement | null>(null)
    const mupen = useMupen(bgm ? romData : undefined, () => {
        if (!mupen || !bgm)
            return

        const ram = new DramView(mupen)

        if (bpmRef.current) {
            const bpm = ram.readU32(patches.RAM_MAMAR_out_masterTempo) / 100
            bpmRef.current.innerText = `${bpm} BPM`
        }
    })

    useEffect(() => {
        if (!mupen || !bgm)
            return

        if (isPlaying) {
            writePatches(mupen)
            //writeBgm(mupen, bgm)
            mupen.resume()
        } else {
            mupen.pause()
        }
    }, [mupen, bgm, isPlaying])

    useEffect(() => {
        const onKeydown = (event: KeyboardEvent) => {
            if (event.key === " ") {
                setIsPlaying(p => !p)
            }
        }
        document.addEventListener("keydown", onKeydown)
        return () => document.removeEventListener("keydown", onKeydown)
    }, [])

    /*useEffect(() => {
        if (!mupen || !bgm)
            return

        const i = setInterval(() => {
            writeBgm(mupen, bgm)
        }, 4000)
        return () => clearInterval(i)
    }, [mupen, bgm])*/

    if (!bgm) {
        return <View />
    }

    return <Flex alignItems="center" gap="size-50">
        <span ref={bpmRef}></span>

        <ActionButton
            onPress={() => {
                if (mupen) {
                    mupen.pause()
                    writePatches(mupen)
                    writeBgm(mupen, bgm)
                    mupen.resume()
                }
            }}
        >
            {"Compile"}
        </ActionButton>

        <ToggleButton
            aria-label="Toggle playback"
            UNSAFE_className="PlaybackControls_play"
            isEmphasized
            isSelected={isPlaying}
            onChange={(p: boolean) => {
                setIsPlaying(p)
            }}
        >
            <Play />
        </ToggleButton>
    </Flex>
}
