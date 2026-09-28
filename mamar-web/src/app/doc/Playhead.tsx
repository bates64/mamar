import classNames from "classnames"
import { useEffect, useRef, useState, useContext, createContext, useCallback } from "react"

import styles from "./Playhead.module.scss"
import { useSegmentLengths } from "./Ruler"
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
            {children}
        </CONTEXT.Provider>
    )
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

function snapToBeat(ticks: number): number {
    return Math.round(ticks / 48) * 48
}

export default function Playhead() {
    const { xToTicks, ticksToXOffset } = useTime()
    const [dragPosition, setDragPosition] = useState(0)
    const [songPosition, setSongPosition] = useState<SongPosition | null>(null)
    const context = useContext(CONTEXT)!
    const timeline = useTimeline()
    const dragging = useRef(false)

    const [doc] = useDoc()

    useSongPlayer(useCallback(({ position }: PlayerStatus) => {
        setSongPosition(position ?? null)
    }, []))

    // Forget where the last song got to, so the playhead doesn't show it until the new one reports.
    useEffect(() => {
        setSongPosition(null)
    }, [context.playing])

    useEffect(() => {
        function onMouseMove(e: MouseEvent) {
            if (!dragging.current) return
            let ticks = xToTicks(e.clientX)
            if (!e.shiftKey) {
                ticks = snapToBeat(ticks)
            }
            setDragPosition(ticks)
        }

        function onMouseUp() {
            if (!dragging.current) return
            dragging.current = false
            document.body.style.cursor = ""
            context.setStart(dragPosition)
            if (context.playing) {
                context.play(dragPosition)
            }
        }

        window.addEventListener("mousemove", onMouseMove)
        window.addEventListener("mouseup", onMouseUp)
        return () => {
            window.removeEventListener("mousemove", onMouseMove)
            window.removeEventListener("mouseup", onMouseUp)
        }
    }, [xToTicks, dragPosition, context])

    if (!doc) return null

    let ticks = context.start
    if (dragging.current) {
        ticks = dragPosition
    } else if (context.playing) {
        ticks = songPosition ? timeline.toTicks(songPosition) : context.playing.from
    }
    const isFollowingSong = context.playing && !dragging.current

    return <div
        className={styles.container}
    >
        {isFollowingSong && <div
            className={styles.startMarker}
            style={{ left: ticksToXOffset(context.start) + "px" }}
        />}
        <div
            className={classNames(styles.head, { [styles.following]: isFollowingSong })}
            style={{ left: ticksToXOffset(ticks) + "px" }}
            onMouseDown={e => {
                dragging.current = true
                setDragPosition(ticks)
                document.body.style.cursor = "grab"
                e.stopPropagation()
            }}
            title="Drag to change where playback starts"
        >

        </div>
    </div>
}
