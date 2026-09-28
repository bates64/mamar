import { ActionButton, ToggleButton, View } from "@adobe/react-spectrum"
import { Bgm } from "pm64-typegen"
import { useCallback, useEffect, useId, useRef, useState, useContext } from "react"
import { Play, SkipBack } from "react-feather"

import styles from "./PlaybackControls.module.scss"
import useSongPlayer, { PlayerStatus, SongPosition } from "./SongPlayer"

import Bridge from "../bridge"
import { CONTEXT as PLAYHEAD_CONTEXT, useTimeline } from "../doc/Playhead"
import { useDoc } from "../store"
import VerticalDragNumberInput from "../VerticalDragNumberInput"

function encodeBgm(bgm: Bgm): Uint8Array {
    const bgmBin: Uint8Array | string = Bridge.bgm_encode(bgm)

    if (typeof bgmBin === "string") {
        throw new Error(bgmBin)
    }

    return bgmBin
}

export default function PlaybackControls() {
    const [doc, dispatch] = useDoc()
    const bgm = doc?.bgm ?? null
    const activeVariation = doc?.activeVariation ?? -1
    const [ambientSound, setAmbientSound] = useState(6) // AMBIENT_SILENCE
    const bpmRef = useRef<HTMLSpanElement | null>(null)
    const actionsRef = useRef<HTMLDivElement | null>(null)
    const songPosition = useRef<SongPosition | null>(null)
    const player = useSongPlayer(useCallback(({ tempo, position }: PlayerStatus) => {
        if (bpmRef.current) {
            bpmRef.current.innerText = tempo.toString()
        }
        songPosition.current = position ?? null
    }, [bpmRef]))
    const playhead = useContext(PLAYHEAD_CONTEXT)!
    const { playing, play, stop } = playhead
    const timeline = useTimeline()
    // Ticks along the timeline where playback last stopped, which Shift+Space continues from.
    const stoppedAt = useRef<number | null>(null)
    const loaded = useRef<{ playing: typeof playing, variation: number } | null>(null)

    // Access the entire bgm object so useDoc tracks any change to it
    JSON.stringify(bgm)

    // Loads the song when playback starts, and again when it changes while playing, from wherever it has got to.
    useEffect(() => {
        if (!bgm || activeVariation < 0 || !playing) {
            loaded.current = null
            return
        }

        let start = timeline.toPosition(playing.from)
        if (loaded.current?.playing === playing) {
            if (loaded.current.variation !== activeVariation) {
                start = { segment: 0, tick: 0 }
            } else if (songPosition.current) {
                start = songPosition.current
            }
        }
        loaded.current = { playing, variation: activeVariation }
        player.load(encodeBgm(bgm), activeVariation, start)
    // timeline and songPosition change as the song does, which bgm tracks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [player, bgm, activeVariation, playing])

    useEffect(() => {
        player.setPaused(!playing)
        if (!playing && songPosition.current) {
            stoppedAt.current = timeline.toTicks(songPosition.current)
        }
    // timeline and songPosition only matter at the moment playback stops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [player, playing])

    useEffect(() => player.onStop?.(stop), [player, stop])

    useEffect(() => {
        if (!bgm) {
            stop()
        }
    }, [bgm, stop])

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

            // Other buttons keep Space to press them.
            if (target.closest("button") && !actionsRef.current?.contains(target)) {
                return
            }

            if (event.key === " ") {
                if (playing) {
                    stop()
                } else if (activeVariation >= 0) {
                    play(event.shiftKey ? stoppedAt.current ?? playhead.start : playhead.start)
                }
                event.preventDefault()
                event.stopPropagation()
            }
        }
        // Captures Space before the playback buttons do, so Shift+Space works while one has focus.
        document.addEventListener("keydown", onKeydown, true)
        return () => document.removeEventListener("keydown", onKeydown, true)
    }, [playing, play, stop, activeVariation, playhead.start])

    useEffect(() => {
        player.setAmbientSound(ambientSound)
    }, [player, ambientSound])

    const variationId = useId()
    const ambientSoundId = useId()

    if (!bgm) {
        return <View />
    }

    return <View paddingX="size-200" paddingY="size-50" UNSAFE_className={styles.container}>
        <div ref={actionsRef} className={styles.actions} role="group" aria-label="Playback actions">
            <ActionButton
                aria-label="Restart"
                onPress={() => {
                    playhead.setStart(0)
                    if (playing) {
                        play(0)
                    }
                }}
            >
                <SkipBack />
            </ActionButton>
            <ToggleButton
                aria-label="Play/stop"
                UNSAFE_className={styles.play}
                isEmphasized
                isSelected={playing !== null}
                onChange={(p: boolean) => {
                    if (!p) {
                        stop()
                    } else if (activeVariation >= 0) {
                        play(playhead.start)
                    }
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
