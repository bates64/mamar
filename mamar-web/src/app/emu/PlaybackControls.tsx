import { ActionButton, ToggleButton, Tooltip, TooltipTrigger, View } from "@adobe/react-spectrum"
import { MutableRefObject, useCallback, useEffect, useId, useRef, useContext, useState } from "react"
import { Play, Repeat, SkipBack } from "react-feather"

import styles from "./PlaybackControls.module.scss"
import SnapControl, { ZoomControls } from "./SnapControl"
import useSongPlayer, { PlayerStatus, SongPlayer, SongPosition } from "./SongPlayer"

import { CYCLE_DESCRIPTION } from "../doc/CycleRegion"
import { CONTEXT as PLAYHEAD_CONTEXT, Context as PlayheadContext, PlayheadPosition, useTimeline } from "../doc/Playhead"
import { DEFAULT_BEATS_PER_BAR, TICKS_PER_BEAT, usePickup, useTicksPerBar } from "../doc/Ruler"
import { useDoc, useLocation } from "../store"
import { Cycle, proximityMixValue } from "../store/doc"
import { useOptionalSoundBank } from "../util/hooks/useSoundBank"
import { encodeForGame } from "../util/recordings"
import VerticalDragNumberInput from "../VerticalDragNumberInput"

/**
 * Loads the song when playback starts, and again when it changes while playing, from wherever it has got to. It reads
 * only the song as a whole, so it re-renders when any of it changes without reading all of it.
 */
function SongLoader({ player, playing, timeline, songPosition }: {
    player: SongPlayer
    playing: PlayheadContext["playing"]
    timeline: ReturnType<typeof useTimeline>
    songPosition: MutableRefObject<SongPosition | null>
}) {
    const [doc] = useDoc()
    const sbn = useOptionalSoundBank()
    const bgm = doc?.bgm ?? null
    const activeVariation = doc?.activeVariation ?? -1
    const loaded = useRef<{ playing: typeof playing, variation: number } | null>(null)

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
        player.load(encodeForGame(bgm, sbn), activeVariation, start)
    // timeline and songPosition change as the song does, which bgm tracks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [player, bgm, activeVariation, playing])

    return null
}

/**
 * Shows where the playhead is. Clicking it lets the user type a bar and beat, such as 5.3, and press Enter to move
 * playback there.
 */
function PositionField() {
    const playhead = useContext(PLAYHEAD_CONTEXT)!
    const pickup = usePickup()
    const ticksPerBar = useTicksPerBar()
    const [draft, setDraft] = useState<string | null>(null)
    const id = useId()

    // Bars count from 1, so a pickup before bar 1 is bar 0.
    const startBar = Math.floor((playhead.start - pickup) / ticksPerBar)
    const startBeat = Math.floor((playhead.start - pickup - startBar * ticksPerBar) / TICKS_PER_BEAT)

    function commit() {
        const match = /^\s*(\d+)(?:\.(\d+))?\s*$/.exec(draft ?? "")
        setDraft(null)
        if (!match) return

        const bar = Number(match[1])
        const beat = Number(match[2] ?? 1)
        if (beat < 1) return
        const ticks = Math.max(0, pickup + (bar - 1) * ticksPerBar + (beat - 1) * TICKS_PER_BEAT)
        playhead.setStart(ticks)
        if (playhead.playing) {
            playhead.play(ticks)
        }
    }

    return <div className={styles.field}>
        <label htmlFor={id} className={styles.fieldName}>Position</label>
        {draft === null
            ? <button
                id={id}
                className={styles.positionButton}
                title="Click to go to a bar and beat"
                onClick={() => setDraft(`${startBar + 1}.${startBeat + 1}`)}
            >
                <PlayheadPosition />
            </button>
            : <input
                id={id}
                className={styles.positionInput}
                autoFocus
                size={5}
                value={draft}
                onChange={event => setDraft(event.target.value)}
                onFocus={event => event.target.select()}
                onBlur={() => setDraft(null)}
                onKeyDown={event => {
                    if (event.key === "Enter") {
                        commit()
                    } else if (event.key === "Escape") {
                        setDraft(null)
                    }
                }}
            />}
    </div>
}

export default function PlaybackControls() {
    const [doc, dispatch] = useDoc()
    const bgm = doc?.bgm ?? null
    const activeVariation = doc?.activeVariation ?? -1
    const bpmRef = useRef<HTMLSpanElement | null>(null)
    const actionsRef = useRef<HTMLDivElement | null>(null)
    const songPosition = useRef<SongPosition | null>(null)
    const player = useSongPlayer(useCallback(({ tempo, position }: PlayerStatus) => {
        if (bpmRef.current) {
            bpmRef.current.innerText = tempo.toString()
        }
        songPosition.current = position
    }, [bpmRef]))
    const playhead = useContext(PLAYHEAD_CONTEXT)!
    const { playing, play, stop } = playhead
    const timeline = useTimeline()
    // Ticks along the timeline where playback last stopped, which Shift+Space continues from.
    const stoppedAt = useRef<number | null>(null)
    const cycle = doc?.cycle ?? null
    const pickup = usePickup()
    const ticksPerBar = useTicksPerBar()

    // While cycling, playback from outside the cycle starts at the cycle instead, as it would soon go there anyway.
    const playFrom = useCallback((ticks: number) => {
        play(cycle?.isEnabled && (ticks < cycle.start || ticks >= cycle.end) ? cycle.start : ticks)
    }, [play, cycle])

    const toggleCycle = useCallback(() => {
        // Without a cycle, cycle the bar playback starts in and the three after it.
        const barStart = pickup + Math.floor((playhead.start - pickup) / ticksPerBar) * ticksPerBar
        const next: Cycle = cycle
            ? { ...cycle, isEnabled: !cycle.isEnabled }
            : { start: Math.max(0, barStart), end: Math.max(0, barStart) + ticksPerBar * 4, isEnabled: true }
        dispatch({ type: "set_cycle", cycle: next })
    }, [cycle, dispatch, pickup, ticksPerBar, playhead.start])

    const cycleStart = cycle?.isEnabled ? timeline.toPosition(cycle.start) : null
    const cycleEnd = cycle?.isEnabled ? timeline.toPosition(cycle.end) : null
    useEffect(() => {
        player.setCycle(cycleStart && cycleEnd ? { start: cycleStart, end: cycleEnd } : null)
    // The positions are new objects each render, so the effect depends on their values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [player, cycleStart?.segment, cycleStart?.tick, cycleEnd?.segment, cycleEnd?.tick])

    useEffect(() => {
        player.setPaused(!playing)
        if (!playing && songPosition.current) {
            stoppedAt.current = timeline.toTicks(songPosition.current)
        }
    // timeline and songPosition only matter at the moment playback stops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [player, playing])

    const [location] = useLocation()
    const proximityMix = proximityMixValue(location)
    useEffect(() => {
        player.setLocation(proximityMix, location.alternateParts)
    }, [player, proximityMix, location.alternateParts])

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
                    playFrom(event.shiftKey ? stoppedAt.current ?? playhead.start : playhead.start)
                }
                event.preventDefault()
                event.stopPropagation()
            } else if (event.key === "c" && !event.ctrlKey && !event.metaKey && !event.altKey) {
                toggleCycle()
                event.preventDefault()
            }
        }
        // Captures Space before the playback buttons do, so Shift+Space works while one has focus.
        document.addEventListener("keydown", onKeydown, true)
        return () => document.removeEventListener("keydown", onKeydown, true)
    }, [playing, playFrom, stop, activeVariation, playhead.start, toggleCycle])

    const timeSignatureId = useId()
    const variationId = useId()

    if (!bgm) {
        return <View />
    }

    return <View paddingX="size-200" paddingY="size-50" UNSAFE_className={styles.container}>
        <SongLoader player={player} playing={playing} timeline={timeline} songPosition={songPosition} />
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
                        playFrom(playhead.start)
                    }
                }}
            >
                <Play />
            </ToggleButton>
            <TooltipTrigger>
                <ToggleButton
                    aria-label="Cycle"
                    UNSAFE_className={styles.cycle}
                    isSelected={cycle?.isEnabled ?? false}
                    onChange={toggleCycle}
                >
                    <Repeat />
                </ToggleButton>
                <Tooltip>{CYCLE_DESCRIPTION}</Tooltip>
            </TooltipTrigger>
        </div>
        <div className={styles.position} role="group" aria-label="Playback status">
            <PositionField />
            <div className={styles.field} tabIndex={0} aria-live="polite">
                <label className={styles.fieldName}>Tempo</label>
                <span className={styles.tempo} ref={bpmRef}>-</span>
            </div>
            <div className={styles.field}>
                <label htmlFor={timeSignatureId} className={styles.fieldName}>Time signature</label>
                <span className={styles.timeSignature}>
                    <VerticalDragNumberInput
                        id={timeSignatureId}
                        value={bgm.beats_per_bar ?? DEFAULT_BEATS_PER_BAR}
                        minValue={1}
                        maxValue={16}
                        onChange={beatsPerBar => {
                            dispatch({ type: "bgm", action: { type: "set_beats_per_bar", beatsPerBar } })
                        }}
                    />
                    /4
                </span>
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
        </div>
        <div className={styles.tools}>
            <SnapControl />
            <span className={styles.divider} aria-hidden="true" />
            <ZoomControls />
        </div>
    </View>
}
