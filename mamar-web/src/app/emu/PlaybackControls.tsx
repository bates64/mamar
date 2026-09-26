import { ActionButton, ToggleButton, View } from "@adobe/react-spectrum"
import { Bgm } from "pm64-typegen"
import { useCallback, useEffect, useId, useRef, useState, useContext } from "react"
import { Play, SkipBack } from "react-feather"

import styles from "./PlaybackControls.module.scss"
import useSongPlayer, { PlayerStatus } from "./SongPlayer"

import Bridge from "../bridge"
import { CONTEXT as PLAYHEAD_CONTEXT } from "../doc/Playhead"
import { useDoc } from "../store"
import VerticalDragNumberInput from "../VerticalDragNumberInput"

function encodeBgm(bgm: Bgm, variation: number, startTime: number): Uint8Array {
    const bgmBin: Uint8Array | string = Bridge.bgm_encode(bgm, variation, startTime)

    if (typeof bgmBin === "string") {
        throw new Error(bgmBin)
    }

    return bgmBin
}

export default function PlaybackControls() {
    const [doc, dispatch] = useDoc()
    const bgm = doc?.bgm ?? null
    const activeVariation = doc?.activeVariation ?? -1
    const [isPlaying, setIsPlaying] = useState(false)
    const [ambientSound, setAmbientSound] = useState(6) // AMBIENT_SILENCE
    const bpmRef = useRef<HTMLSpanElement | null>(null)
    const actionsRef = useRef<HTMLDivElement | null>(null)
    const player = useSongPlayer(useCallback(({ tempo }: PlayerStatus) => {
        if (bpmRef.current) {
            bpmRef.current.innerText = tempo.toString()
        }
    }, [bpmRef]))
    const playhead = useContext(PLAYHEAD_CONTEXT)!

    // Access the entire bgm object so useDoc tracks any change to it
    JSON.stringify(bgm)

    useEffect(() => {
        player.setPaused(!isPlaying)
    }, [player, isPlaying])

    useEffect(() => player.onStop?.(() => setIsPlaying(false)), [player])

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

            const editor = actionsRef.current?.closest("[data-bgm-editor]")
            if (editor && !editor.contains(target)) {
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

        player.load(encodeBgm(bgm, activeVariation, playhead.position), activeVariation)
    }, [player, bgm, activeVariation, playhead])

    useEffect(() => {
        player.setAmbientSound(ambientSound)
    }, [player, ambientSound])

    const variationId = useId()
    const ambientSoundId = useId()

    if (!bgm) {
        if (isPlaying)
            setIsPlaying(false)
        return <View />
    }

    return <View paddingX="size-200" paddingY="size-50" UNSAFE_className={styles.container}>
        <div ref={actionsRef} className={styles.actions} role="group" aria-label="Playback actions">
            <ActionButton
                aria-label="Restart"
                onPress={async () => {
                    playhead.setPosition(0)
                    const wasPlaying = isPlaying
                    await player.setPaused(true)
                    await player.load(encodeBgm(bgm, activeVariation, 0), activeVariation)
                    if (wasPlaying)
                        await player.setPaused(false)
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
