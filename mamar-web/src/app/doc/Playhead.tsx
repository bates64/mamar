import classNames from "classnames"
import { useEffect, useRef, useState, useContext, createContext, useCallback } from "react"

import styles from "./Playhead.module.scss"
import { TICKS_PER_BEAT, usePickup, useSegmentLengths } from "./Ruler"
import { useTime } from "./TimeProvider"

import useSongPlayer, { PlayerStatus, SongPosition } from "../emu/SongPlayer"
import { useDoc } from "../store"

interface Context {
    /** Where playback starts, and where the playhead returns when it stops, in ticks along the timeline. */
    start: number
    setStart: (ticks: number) => void
    /** What's playing, or null when stopped. Each call to `play` makes a new object. */
    playing: { from: number } | null
    /** Plays from `from` ticks along the timeline, replacing whatever is playing. */
    play: (from: number) => void
    stop: () => void
}

export const CONTEXT = createContext<Context | null>(null)

export function PlayheadContextProvider({ children }: { children: React.ReactNode }) {
    const [start, setStart] = useState(0)
    const [playing, setPlaying] = useState<{ from: number } | null>(null)
    const [doc] = useDoc()

    // If the variation changes, reset the position
    useEffect(() => {
        setStart(0)
    }, [doc?.id, doc?.activeVariation])

    const play = useCallback((from: number) => setPlaying({ from }), [])
    const stop = useCallback(() => setPlaying(null), [])

    return (
        <CONTEXT.Provider value={{ start, setStart, playing, play, stop }}>
            <DisplayProvider start={start} playing={playing}>
                {children}
            </DisplayProvider>
        </CONTEXT.Provider>
    )
}

interface Display {
    /** Ticks along the timeline the playhead is at. */
    ticks: number
    /** Whether the playhead follows the song playing, rather than showing where playback starts. */
    isFollowingSong: boolean
    /** Whether the playhead moved forward a little since it last drew, so it glides there rather than jumping. */
    isGliding: boolean
    /** Shows the playhead at `ticks` while it's dragged, or where it would be otherwise if null. */
    setDragPosition: (ticks: number | null) => void
}

// Separate from CONTEXT so that only the playhead redraws as the song plays.
const DISPLAY_CONTEXT = createContext<Display | null>(null)

/** The furthest the playhead glides, in ticks. Further moves, such as seeks, jump. */
const MAX_GLIDE_TICKS = 48

function DisplayProvider({ start, playing, children }: {
    start: number
    playing: Context["playing"]
    children: React.ReactNode
}) {
    const timeline = useTimeline()
    const [dragPosition, setDragPosition] = useState<number | null>(null)
    // Tagged with what was playing when the player reported it, so a position from before playback started is ignored.
    const [song, setSong] = useState<{ playing: Context["playing"], position: SongPosition | null } | null>(null)
    const latestPlaying = useRef(playing)

    useEffect(() => {
        latestPlaying.current = playing
    }, [playing])

    useSongPlayer(useCallback(({ position }: PlayerStatus) => {
        if (latestPlaying.current) {
            setSong({ playing: latestPlaying.current, position: position ?? null })
        }
    }, []))

    let ticks = start
    let isFollowingSong = false
    if (dragPosition !== null) {
        ticks = dragPosition
    } else if (playing) {
        isFollowingSong = true
        ticks = song?.playing === playing && song.position ? timeline.toTicks(song.position) : playing.from
    }

    const lastTicks = useRef(ticks)
    useEffect(() => {
        lastTicks.current = ticks
    }, [ticks])
    const isGliding = isFollowingSong && ticks >= lastTicks.current && ticks - lastTicks.current <= MAX_GLIDE_TICKS

    return <DISPLAY_CONTEXT.Provider value={{ ticks, isFollowingSong, isGliding, setDragPosition }}>
        {children}
    </DISPLAY_CONTEXT.Provider>
}

function ticksToLeft(ticks: number): string {
    return `calc(${ticks}px / var(--ruler-zoom))`
}

/**
 * Converts between ticks along the timeline, which lays each segment of the variation out once, and positions in the
 * variation.
 */
export function useTimeline() {
    const lengths = useSegmentLengths()

    return {
        toTicks({ segment, tick }: SongPosition): number {
            let ticks = 0
            for (let i = 0; i < segment && i < lengths.length; i++) {
                ticks += lengths[i]
            }
            return ticks + Math.min(tick, lengths[segment] ?? 0)
        },
        toPosition(ticks: number): SongPosition {
            let segmentStart = 0
            for (let i = 0; i < lengths.length; i++) {
                if (ticks < segmentStart + lengths[i]) {
                    return { segment: i, tick: ticks - segmentStart }
                }
                segmentStart += lengths[i]
            }
            return { segment: lengths.length, tick: 0 }
        },
    }
}

/** Rounds to the nearest beat, counting beats from bar 1. */
function snapToBeat(ticks: number, pickup: number): number {
    return Math.max(0, pickup + Math.round((ticks - pickup) / TICKS_PER_BEAT) * TICKS_PER_BEAT)
}

export default function Playhead() {
    const { xToTicks } = useTime()
    const pickup = usePickup()
    const context = useContext(CONTEXT)!
    const display = useContext(DISPLAY_CONTEXT)!
    const dragPosition = useRef<number | null>(null)

    const [doc] = useDoc()

    useEffect(() => {
        function onMouseMove(e: MouseEvent) {
            if (dragPosition.current === null) return
            let ticks = xToTicks(e.clientX)
            if (!e.shiftKey) {
                ticks = snapToBeat(ticks, pickup)
            }
            dragPosition.current = ticks
            display.setDragPosition(ticks)
        }

        function onMouseUp() {
            const ticks = dragPosition.current
            if (ticks === null) return
            dragPosition.current = null
            document.body.style.cursor = ""
            display.setDragPosition(null)
            context.setStart(ticks)
            if (context.playing) {
                context.play(ticks)
            }
        }

        window.addEventListener("mousemove", onMouseMove)
        window.addEventListener("mouseup", onMouseUp)
        return () => {
            window.removeEventListener("mousemove", onMouseMove)
            window.removeEventListener("mouseup", onMouseUp)
        }
    }, [xToTicks, pickup, display, context])

    if (!doc) return null

    return <div
        className={styles.container}
    >
        {display.isFollowingSong && <div
            className={styles.startMarker}
            style={{ left: ticksToLeft(context.start) }}
            title="Where playback starts"
        />}
        <div
            className={classNames(styles.head, { [styles.gliding]: display.isGliding })}
            style={{ left: ticksToLeft(display.ticks) }}
            onMouseDown={e => {
                dragPosition.current = display.ticks
                display.setDragPosition(display.ticks)
                document.body.style.cursor = "grab"
                e.stopPropagation()
            }}
            title="Drag to change where playback starts"
            data-no-drag-scroll
        >

        </div>
    </div>
}

/** A line down a TimeGrid where the playhead is. */
export function PlayheadLine() {
    const display = useContext(DISPLAY_CONTEXT)

    if (!display) return null

    return <div
        className={classNames(styles.line, { [styles.gliding]: display.isGliding })}
        style={{ left: ticksToLeft(display.ticks) }}
    />
}
