import { ActionButton, ToggleButton, View } from "@adobe/react-spectrum"
import { EmulatorControls } from "mupen64plus-web"
import * as patches from "patches"
import { Bgm } from "pm64-typegen"
import { useCallback, useEffect, useId, useRef, useState, useContext } from "react"
import { Play, SkipBack } from "react-feather"

import styles from "./PlaybackControls.module.scss"

import Bridge from "../bridge"
import { CONTEXT as PLAYHEAD_CONTEXT } from "../doc/Playhead"
import { useDoc } from "../store"
import DramView from "../util/DramView"
import useMupen from "../util/hooks/useMupen"
import VerticalDragNumberInput from "../VerticalDragNumberInput"

function writePatches(emu: EmulatorControls) {
    const dram = new DramView(emu)

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

function writeBgm(emu: EmulatorControls, bgm: Bgm, variation: number, startTime: number) {
    if (variation < 0 || variation >= bgm.variations.length) {
        return
    }

    const bgmBin: Uint8Array | string = Bridge.bgm_encode(bgm, variation, startTime)

    if (bgmBin instanceof Uint8Array) {
        const dram = new DramView(emu)

        if (bgmBin.length > 0x20000) {
            throw new Error(`Encoded BGM too large, ${bgmBin.length} > 0x20000 bytes`)
        }

        console.log(`Writing BGM to ${patches.RAM_MAMAR_bgm.toString(16)}`)
        dram.writeU8(patches.RAM_MAMAR_bgm, bgmBin)
        dram.writeU32(patches.RAM_MAMAR_bgm_size, bgmBin.length)
        dram.writeU32(patches.RAM_MAMAR_bk_files, new Uint32Array([0, 0, 0]))
        dram.writeU32(patches.RAM_MAMAR_song_id, tickTock ? 0 : 1)
        dram.writeU32(patches.RAM_MAMAR_song_variation, variation)

        tickTock = !tickTock
    } else {
        throw new Error(bgmBin)
    }
}

function writeAmbientSound(emu: EmulatorControls, ambientSound: number) {
    const dram = new DramView(emu)
    dram.writeU32(patches.RAM_MAMAR_ambient_sounds, ambientSound)
}

export default function PlaybackControls() {
    const [doc, dispatch] = useDoc()
    const bgm = doc?.bgm ?? null
    const activeVariation = doc?.activeVariation ?? -1
    const [isPlaying, setIsPlaying] = useState(false)
    const [ambientSound, setAmbientSound] = useState(6) // AMBIENT_SILENCE
    const bpmRef = useRef<HTMLSpanElement | null>(null)
    // const readPosRef = useRef<HTMLSpanElement | null>(null)
    const { emu } = useMupen(useCallback((emu: EmulatorControls) => {
        const ram = new DramView(emu)

        if (bpmRef.current) {
            const bpm = ram.readU32(patches.RAM_MAMAR_out_masterTempo) / 100
            bpmRef.current.innerText = bpm.toString()
        }

        // if (readPosRef.current) {
        //     const readPos = ram.readU32(patches.RAM_MAMAR_out_segmentReadPos)
        //     readPosRef.current.innerText = `0x${readPos.toString(16)}:`

        //     for (let i = 0; i < 16; i++) {
        //         const readPos = ram.readU32(patches.RAM_MAMAR_out_trackReadPos + i * 4)
        //         readPosRef.current.innerText += ` ${readPos.toString(16)}`
        //     }
        // }
    }, [bpmRef]))
    const playhead = useContext(PLAYHEAD_CONTEXT)!

    // Access the entire bgm object so useDoc tracks any change to it
    JSON.stringify(bgm)

    useEffect(() => {
        if (isPlaying) {
            writePatches(emu)
            emu.resume()
        } else {
            emu.pause()
        }
    }, [emu, isPlaying])

    useEffect(() => {
        const onKeydown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement
            if (
                target.tagName === "INPUT" ||
                target.tagName === "TEXTAREA" ||
                target.isContentEditable
            ) {
                return
            }

            if (event.key === " ") {
                setIsPlaying(p => !p)
                event.preventDefault()
                event.stopPropagation()
            }
        }
        document.addEventListener("keydown", onKeydown)
        return () => document.removeEventListener("keydown", onKeydown)
    }, [])

    useEffect(() => {
        console.log("bgm change")
        if (!bgm || activeVariation < 0)
            return

        writeBgm(emu, bgm, activeVariation, playhead.position)
    }, [emu, bgm, activeVariation, playhead])

    useEffect(() => {
        writeAmbientSound(emu, ambientSound)
    }, [emu, ambientSound])

    const variationId = useId()
    const ambientSoundId = useId()

    if (!bgm) {
        if (isPlaying)
            setIsPlaying(false)
        return <View />
    }

    return <View paddingX="size-200" paddingY="size-50" UNSAFE_className={styles.container}>
        <div className={styles.actions} role="group" aria-label="Playback actions">
            <ActionButton
                aria-label="Restart"
                onPress={async () => {
                    playhead.setPosition(0)
                    if (emu) {
                        const wasPlaying = isPlaying
                        await emu.pause()
                        writePatches(emu)
                        writeBgm(emu, bgm, activeVariation, 0)
                        if (wasPlaying)
                            await emu.resume()
                    }
                }}
            >
                <SkipBack />
            </ActionButton>
            <ToggleButton
                aria-label="Play/pause"
                UNSAFE_className={styles.play}
                isEmphasized
                isSelected={isPlaying}
                onChange={(p: boolean) => {
                    if (activeVariation >= 0)
                        setIsPlaying(p)
                }}
            >
                <Play />
            </ToggleButton>
        </div>
        <div className={styles.position} role="group" aria-label="Playback status">
            <div className={styles.field} tabIndex={0} aria-live="polite">
                <label className={styles.fieldName}>Tempo</label>
                <span className={styles.tempo} ref={bpmRef}>-</span>
            </div>
            <div className={styles.field}>
                <label htmlFor={variationId} className={styles.fieldName}>Variation</label>
                <VerticalDragNumberInput
                    id={variationId}
                    value={doc?.activeVariation ?? 0}
                    minValue={0}
                    maxValue={bgm.variations.length - 1}
                    onChange={index => {
                        dispatch({ type: "set_variation", index })
                    }}
                />
            </div>
            <div className={styles.field}>
                <label htmlFor={ambientSoundId} className={styles.fieldName}>Ambient SFX</label>
                <VerticalDragNumberInput
                    id={ambientSoundId}
                    value={ambientSound}
                    minValue={0}
                    maxValue={16}
                    onChange={setAmbientSound}
                />
            </div>
        </div>
    </View>
}
