import { ActionButton, Flex, ToggleButton, View } from "@adobe/react-spectrum"
import Play from "@spectrum-icons/workflow/Play"
import { bgm_encode } from "mamar-wasm-bridge"
import { EmulatorControls } from "mupen64plus-web"
import * as patches from "patches"
import { Bgm } from "pm64-typegen"
import { useEffect, useRef, useState } from "react"

import VariationPicker from "../doc/VariationPicker"
import { useDoc } from "../store"
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

let tickTock = false

function writeBgm(mupen: EmulatorControls, bgm: Bgm, variation: number) {
    if (variation < 0 || variation >= bgm.variations.length) {
        return
    }

    const bgmBin: Uint8Array | string = bgm_encode(bgm)

    if (bgmBin instanceof Uint8Array) {
        const dram = new DramView(mupen)

        if (bgmBin.length > 0x20000) {
            throw new Error(`Encoded BGM too large, ${bgmBin.length} > 0x20000 bytes`)
        }

        console.log(`Writing BGM to ${patches.RAM_MAMAR_bgm.toString(16)}`)
        dram.writeU8(patches.RAM_MAMAR_bgm, bgmBin)
        dram.writeU32(patches.RAM_MAMAR_bgm_size, bgmBin.length)
        dram.writeU32(patches.RAM_MAMAR_bk_files, new Uint32Array([0, 0, 0]))
        dram.writeU32(patches.RAM_MAMAR_song_id, tickTock ? 0 : 1)
        dram.writeU32(patches.RAM_MAMAR_song_variation, variation)
        dram.writeU32(patches.RAM_MAMAR_ambient_sounds, 6) // AMBIENT_SILENCE

        tickTock = !tickTock
    } else {
        throw new Error(bgmBin)
    }
}

export default function PlaybackControls() {
    const [doc] = useDoc()
    const bgm = doc?.bgm ?? null
    const activeVariation = doc?.activeVariation ?? -1
    const [isPlaying, setIsPlaying] = useState(false)
    const romData = useRomData()
    const bpmRef = useRef<HTMLSpanElement | null>(null)
    const readPosRef = useRef<HTMLSpanElement | null>(null)
    const mupen = useMupen(bgm ? romData : undefined, () => {
        if (!mupen || !bgm)
            return

        const ram = new DramView(mupen)

        if (bpmRef.current) {
            const bpm = ram.readU32(patches.RAM_MAMAR_out_masterTempo) / 100
            bpmRef.current.innerText = `${bpm} BPM`
        }

        if (readPosRef.current) {
            const readPos = ram.readU32(patches.RAM_MAMAR_out_segmentReadPos)
            readPosRef.current.innerText = `0x${readPos.toString(16)}:`

            for (let i = 0; i < 16; i++) {
                const readPos = ram.readU32(patches.RAM_MAMAR_out_trackReadPos + i * 4)
                readPosRef.current.innerText += ` ${readPos.toString(16)}`
            }
        }
    })

    useEffect(() => {
        if (!mupen)
            return

        if (isPlaying) {
            writePatches(mupen)
            mupen.resume()
        } else {
            mupen.pause()
        }
    }, [mupen, isPlaying])

    useEffect(() => {
        const onKeydown = (event: KeyboardEvent) => {
            if (event.key === " ") {
                setIsPlaying(p => !p)
                event.preventDefault()
            }
        }
        document.addEventListener("keydown", onKeydown)
        return () => document.removeEventListener("keydown", onKeydown)
    }, [])

    useEffect(() => {
        if (!mupen || !bgm || activeVariation < 0)
            return

        writeBgm(mupen, bgm, activeVariation)
    }, [mupen, bgm, activeVariation])

    if (!bgm) {
        return <View />
    }

    return <View paddingX="size-200" paddingY="size-50">
        <Flex alignItems="center" justifyContent="space-between" gap="size-200">
            <Flex gap="size-50">
                <VariationPicker />
                <ActionButton
                    onPress={async () => {
                        if (mupen) {
                            const wasPlaying = isPlaying
                            await mupen.pause()
                            writePatches(mupen)
                            writeBgm(mupen, bgm, activeVariation)
                            if (wasPlaying)
                                await mupen.resume()
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
                        if (activeVariation >= 0)
                            setIsPlaying(p)
                    }}
                >
                    <Play />
                </ToggleButton>
            </Flex>
            <Flex gap="size-100">
                <span ref={bpmRef}></span>
                <span ref={readPosRef}></span>
            </Flex>
        </Flex>
    </View>
}
