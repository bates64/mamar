import { useEffect, useLayoutEffect, useRef, useState, useContext, createContext, useCallback } from "react"

import styles from "./Playhead.module.scss"
import { TICKS_PER_BEAT, usePickup, useSegmentLengths, useTicksPerBar } from "./Ruler"
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
    /** Ticks along the timeline the playhead is at, while it isn't following the song. */
    ticks: number
    /** Whether the playhead follows the song playing, rather than showing where playback starts. */
    isFollowingSong: boolean
    /** Shows the playhead at `ticks` while it's dragged, or where it would be otherwise if null. */
    setDragPosition: (ticks: number | null) => void
    /** Calls `listener` every frame with the ticks the playhead is at while it follows the song, until unsubscribed. */
    onFrame: (listener: (ticks: number) => void) => () => void
}

// Separate from CONTEXT so that only the playhead redraws as the song plays.
const DISPLAY_CONTEXT = createContext<Display | null>(null)

/** How far the playhead eases towards where the song is each frame, as a fraction of the distance. */
const EASE = 0.1

/** How far behind or ahead of the song the playhead eases rather than jumps, in ticks, such as when it seeks. */
const MAX_EASE_TICKS = TICKS_PER_BEAT

interface Report {
    /** When the player reported it, as a performance.now() time. */
    time: number
    /** What was playing then, so a position from before playback started is ignored. */
    playing: Context["playing"]
    position: SongPosition | null
}

function DisplayProvider({ start, playing, children }: {
    start: number
    playing: Context["playing"]
    children: React.ReactNode
}) {
    const timeline = useTimeline()
    const [dragPosition, setDragPosition] = useState<number | null>(null)
    const frameListeners = useRef(new Set<(ticks: number) => void>())

    const latest = useRef({ playing, timeline })
    useEffect(() => {
        latest.current = { playing, timeline }
    })

    // What the player reported, oldest first, so the playhead can show what's being heard rather than played.
    const reports = useRef<Report[]>([])
    const latency = useRef(0)
    const ticksPerMs = useRef(0)

    useSongPlayer(useCallback(({ position, latency: reportedLatency = 0, tempo }: PlayerStatus) => {
        const { playing, timeline } = latest.current
        if (!playing) {
            return
        }

        const now = performance.now()
        latency.current = reportedLatency
        ticksPerMs.current = tempo * TICKS_PER_BEAT / 60_000

        // The song started up to a report earlier than its first report says, so work out when from its tempo.
        const previous = reports.current[reports.current.length - 1]
        if (position && ticksPerMs.current > 0 && !(previous?.playing === playing && previous.position)) {
            const since = timeline.toTicks(position) - playing.from
            if (since >= 0 && since <= MAX_EASE_TICKS) {
                const time = now - since / ticksPerMs.current
                reports.current.push({ time, playing, position: timeline.toPosition(playing.from) })
            }
        }

        reports.current.push({ time: now, playing, position: position ?? null })
    }, []))

    // Moves the playhead every frame while it follows the song, so it moves smoothly and scrolls in step.
    const isFollowingSong = playing !== null && dragPosition === null
    useEffect(() => {
        if (!playing || !isFollowingSong) return

        // Reports arrive unevenly, so rather than following them exactly, the playhead moves at the song's tempo and
        // eases towards where they say the song is.
        let shown = playing.from
        let lastFrame = performance.now()
        let frame = requestAnimationFrame(function draw(now) {
            const target = heardTicks(reports.current, playing, now - latency.current, latest.current.timeline)
            if (target === undefined) {
                // Nothing's being heard yet, or anymore, so there's nothing to move with.
                shown = playing.from
            } else {
                const predicted = shown + ticksPerMs.current * (now - lastFrame)
                const error = target - predicted
                shown = Math.abs(error) > MAX_EASE_TICKS ? target : predicted + error * EASE
            }
            lastFrame = now

            for (const listener of frameListeners.current) {
                listener(shown)
            }
            frame = requestAnimationFrame(draw)
        })
        return () => cancelAnimationFrame(frame)
    }, [playing, isFollowingSong])

    const onFrame = useCallback((listener: (ticks: number) => void) => {
        frameListeners.current.add(listener)
        return () => {
            frameListeners.current.delete(listener)
        }
    }, [])

    const ticks = dragPosition ?? (playing ? playing.from : start)

    return <DISPLAY_CONTEXT.Provider value={{ ticks, isFollowingSong, setDragPosition, onFrame }}>
        {children}
    </DISPLAY_CONTEXT.Provider>
}

/**
 * Ticks along the timeline that `playing` had reached at `heardAt`, interpolating between reports, or undefined if it
 * wasn't playing then. Drops the reports from before then.
 */
function heardTicks(
    reports: Report[],
    playing: NonNullable<Context["playing"]>,
    heardAt: number,
    timeline: ReturnType<typeof useTimeline>,
): number | undefined {
    while (reports.length > 1 && reports[1].time <= heardAt) {
        reports.shift()
    }

    const [before, after] = reports
    if (!before?.position || before.time > heardAt || before.playing !== playing) {
        return undefined
    }

    const { segment, tick } = before.position
    if (after?.position?.segment === segment && after.position.tick >= tick) {
        const progress = (heardAt - before.time) / (after.time - before.time)
        return timeline.toTicks({ segment, tick: tick + (after.position.tick - tick) * progress })
    }
    return timeline.toTicks(before.position)
}

/** Calls `apply` with the ticks the playhead is at when it moves, which is every frame while it follows the song. */
function usePlayheadTicks(apply: (ticks: number) => void) {
    const display = useContext(DISPLAY_CONTEXT)

    useLayoutEffect(() => {
        if (!display) return
        if (display.isFollowingSong) {
            return display.onFrame(apply)
        }
        apply(display.ticks)
    }, [display, apply])
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

/** How close the playhead gets to either edge of the timeline, as a fraction of its width, before it scrolls. */
const FOLLOW_MARGIN = 0.1

/** Rounds to the nearest beat, counting beats from bar 1. */
export function snapToBeat(ticks: number, pickup: number): number {
    return Math.max(0, pickup + Math.round((ticks - pickup) / TICKS_PER_BEAT) * TICKS_PER_BEAT)
}

export default function Playhead() {
    const { xToTicks } = useTime()
    const pickup = usePickup()
    const context = useContext(CONTEXT)!
    const display = useContext(DISPLAY_CONTEXT)!
    const dragPosition = useRef<number | null>(null)
    const head = useRef<HTMLDivElement | null>(null)

    const [doc] = useDoc()

    // Moves the playhead and, while it follows the song, scrolls every TimeGrid to keep it in view, all in one frame.
    usePlayheadTicks(useCallback((ticks: number) => {
        const el = head.current
        if (!el) return
        el.style.left = ticksToLeft(ticks)

        const scroller = el.closest<HTMLElement>("[data-time-grid]")
        if (!display.isFollowingSong || !scroller) return
        const zoom = parseFloat(getComputedStyle(scroller).getPropertyValue("--ruler-zoom"))
        const x = ticks / zoom
        const margin = scroller.clientWidth * FOLLOW_MARGIN
        let scrollLeft = scroller.scrollLeft
        if (x > scrollLeft + scroller.clientWidth - margin) {
            scrollLeft = x - scroller.clientWidth + margin
        } else if (x < scrollLeft + margin) {
            scrollLeft = x - margin
        }
        if (scrollLeft !== scroller.scrollLeft) {
            for (const grid of el.closest("[data-time-provider]")?.querySelectorAll<HTMLElement>("[data-time-grid]") ?? []) {
                grid.scrollLeft = scrollLeft
            }
        }
    }, [display.isFollowingSong]))

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
            ref={head}
            className={styles.head}
            onMouseDown={e => {
                const ticks = xToTicks(e.clientX)
                dragPosition.current = ticks
                display.setDragPosition(ticks)
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
    const line = useRef<HTMLDivElement | null>(null)

    usePlayheadTicks(useCallback((ticks: number) => {
        if (line.current) {
            line.current.style.left = ticksToLeft(ticks)
        }
    }, []))

    return <div ref={line} className={styles.line} />
}

/** Where the playhead is, as bar and beat, counting the pickup as bar 0. */
export function PlayheadPosition() {
    const text = useRef<HTMLSpanElement | null>(null)
    const pickup = usePickup()
    const ticksPerBar = useTicksPerBar()

    usePlayheadTicks(useCallback((ticks: number) => {
        if (!text.current) return
        const sinceBar1 = ticks - pickup
        const bar = Math.floor(sinceBar1 / ticksPerBar)
        const beat = Math.floor((sinceBar1 - bar * ticksPerBar) / TICKS_PER_BEAT)
        text.current.textContent = `${bar + 1}.${beat + 1}`
    }, [pickup, ticksPerBar]))

    return <span ref={text} />
}
