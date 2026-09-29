import { type Bgm, type Event, type Track } from "pm64-typegen"
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { getUntrackedObject } from "react-tracked"

import { timeline } from "./lanes"
import { HIGHEST_PITCH, LOWEST_PITCH, NOTE_HEIGHT } from "./pitches"
import { PitchLimit } from "./pitchLimit"
import { CONTEXT as PLAYHEAD_CONTEXT } from "./Playhead"
import { useSnap } from "./snap"

import Bridge from "../bridge"
import { useBgm, useDoc, useLocation } from "../store"
import { alternatePartOf } from "../store/bgm"
import { useSelectedIds } from "../store/doc"
import { useSize } from "../util/hooks/useSize"

/** Pixels from a note's end that resize it rather than move it. */
const RESIZE_EDGE = 6

const DEFAULT_VELOCITY = 100

export interface Props {
    trackListId: number
    trackIndex: number
    /** Where the segment starts on the timeline. */
    segmentStart: number
    /** The highest pitch the track's instrument plays at its own pitch through the segment. */
    pitchLimits: PitchLimit[]
}

export default function PianoRoll({ trackListId, trackIndex, segmentStart, pitchLimits }: Props) {
    const [bgm] = useBgm()
    const [location] = useLocation()
    const trackList = bgm?.track_lists[trackListId]
    const track = trackList?.tracks[trackIndex]

    if (!bgm || !trackList || !track) return null

    // The track's other version: the track an alternate part is for, or a track's alternate part
    const otherIndex = track.alternate_for ?? alternatePartOf(trackList, trackIndex)
    const behind = otherIndex !== undefined ? trackList.tracks[otherIndex] : null

    return <Canvas
        trackListId={trackListId}
        trackIndex={trackIndex}
        track={track}
        branches={bgm.branches}
        mix={location.mix}
        behind={behind}
        segmentStart={segmentStart}
        pitchLimits={pitchLimits}
    />
}

interface NoteAt {
    event: Event & { Note: { pitch: number, velocity: number, length: number } }
    time: number
}

type Drag = {
    mode: "move" | "resize"
    /** The note the drag started on, which the others follow. */
    note: NoteAt
    startX: number
    startY: number
    /** How far the notes move in time and pitch, or how much longer they get. */
    time: number
    pitch: number
    length: number
} | {
    mode: "select"
    startX: number
    startY: number
    x: number
    y: number
    /** Whether the notes in the box are added to the selection, rather than replacing it. */
    add: boolean
}

/** Notes copied from a track, relative to the first one's time. */
let clipboard: { offset: number, pitch: number, velocity: number, length: number }[] = []

/**
 * Draws the track's notes and edits them. Double-click empty space to add a note. Click a note to select it, Shift-click
 * to add it to the selection, or drag across empty space to select the notes in a box. Drag selected notes to move them,
 * or their ends to resize them. Delete removes the selected notes, Q snaps them to the grid, and the usual shortcuts
 * copy, paste, duplicate, and select all. Notes snap to the grid unless Shift is held.
 */
function Canvas({ trackListId, trackIndex, track, branches, mix, behind, segmentStart, pitchLimits }: {
    trackListId: number
    trackIndex: number
    track: Track
    branches: Bgm["branches"]
    mix: number
    behind: Track | null
    /** Where the segment starts on the timeline, for pasting at the playback start point. */
    segmentStart: number
    pitchLimits: PitchLimit[]
}) {
    const canvas = useSize<HTMLCanvasElement>()
    const containerRef = useRef<HTMLDivElement | null>(null)
    type Renderer = InstanceType<typeof Bridge.PianoRoll>
    const rendererRef = useRef<Renderer | null>(null)
    const rafRef = useRef<number>(0)
    const [, docDispatch] = useDoc()
    const [, dispatch] = useBgm()
    const [, snap, grid] = useSnap()
    const playhead = useContext(PLAYHEAD_CONTEXT)
    const [drag, setDrag] = useState<Drag | null>(null)
    const target = { trackList: trackListId, track: trackIndex }

    const notes: NoteAt[] = useMemo(
        () => timeline(track.commands).filter((played): played is NoteAt => "Note" in played.event),
        [track.commands],
    )
    const selectedIds = useSelectedIds(trackListId, trackIndex)
    const selectedNotes = notes.filter(note => selectedIds.includes(note.event.id))
    const select = (ids: number[]) => docDispatch({ type: "set_selection", selection: ids.length > 0 ? { ...target, events: ids } : null })

    const zoom = () => parseFloat(getComputedStyle(canvas.ref.current!).getPropertyValue("--ruler-zoom")) || 2
    const pitchAt = (y: number) => HIGHEST_PITCH - Math.floor(y / NOTE_HEIGHT)
    const noteAt = (x: number, y: number) => {
        const ticks = x * zoom()
        const pitch = pitchAt(y)
        return [...notes].reverse().find(note => note.event.Note.pitch === pitch &&
            ticks >= note.time && ticks <= note.time + Math.max(note.event.Note.length, RESIZE_EDGE * zoom()))
    }
    const localPoint = (event: React.PointerEvent | React.MouseEvent) => {
        const rect = canvas.ref.current!.getBoundingClientRect()
        return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }
    const noteCommand = (note: NoteAt, changes: Partial<NoteAt["event"]["Note"]>) => ({ Note: { ...note.event.Note, ...changes } })

    const deleteNotes = (ids: number[]) => {
        dispatch({ type: "delete_track_commands", ...target, ids })
        select([])
    }
    const paste = (time: number, copied = clipboard) => {
        dispatch({
            type: "insert_track_commands",
            ...target,
            inserts: copied.map(({ offset, ...note }) => ({ time: time + offset, command: { Note: note } })),
        })
    }
    const copy = (copied: NoteAt[]) => {
        const start = Math.min(...copied.map(note => note.time))
        return copied.map(note => ({ ...note.event.Note, offset: note.time - start }))
    }

    // init once (after canvas exists), and before the roll is centred on its notes
    useLayoutEffect(() => {
        const el = canvas.ref.current
        if (!el) return

        const ctx = el.getContext("2d", { alpha: false })!
        const r = new Bridge.PianoRoll()
        rendererRef.current = r

        containerRef.current!.style.height = `${r.scroll_height()}px`

        let alive = true

        const resize = () => {
            const dpr = window.devicePixelRatio || 1
            const rect = el.getBoundingClientRect()
            el.width = Math.max(1, Math.floor(rect.width * dpr))
            el.height = Math.max(1, Math.floor(rect.height * dpr))
            r.set_viewport(rect.width, rect.height, dpr)
            r.set_zoom(parseFloat(getComputedStyle(el).getPropertyValue("--ruler-zoom")) || 2)
        }

        const ro = new ResizeObserver(resize)
        ro.observe(el)
        resize()

        const frame = () => {
            if (!alive) return
            rafRef.current = requestAnimationFrame(frame)
            r.render(ctx)
        }
        rafRef.current = requestAnimationFrame(frame)

        return () => {
            alive = false
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
            ro.disconnect()
            rendererRef.current?.free?.()
            rendererRef.current = null
        }
    }, [canvas.ref])

    useLayoutEffect(() => {
        // The renderer's methods aren't unwrapped by the bridge, so pass the objects under react-tracked's proxies
        const untracked = <T extends object>(value: T | null) => (value && getUntrackedObject(value)) ?? value
        rendererRef.current?.set_track(untracked(track), untracked(branches), mix, untracked(behind))
    }, [track, branches, mix, behind])

    useEffect(() => {
        // 0 is no limit, as it isn't a pitch the engine plays
        rendererRef.current?.set_pitch_limits(
            new Uint32Array(pitchLimits.map(({ time }) => time)),
            new Uint8Array(pitchLimits.map(({ limit }) => limit ?? 0)),
        )
    }, [pitchLimits])

    const selectedKey = selectedIds.join()
    useEffect(() => {
        rendererRef.current?.set_selection(new Uint32Array(selectedKey ? selectedKey.split(",").map(Number) : []))
    }, [selectedKey])

    // Centre on the notes when a track opens, but not when it's edited, before the roll is first shown
    useLayoutEffect(() => {
        const r = rendererRef.current
        if (!r) return
        containerRef.current!.style.height = `${r.scroll_height()}px`
        const scrollParent = containerRef.current!.parentElement!
        // The renderer works in CSS pixels, and gives where the notes' middle pitch is
        scrollParent.scrollTop = r.central_scroll_y() - scrollParent.clientHeight / 2
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trackListId, trackIndex])

    // Where the dragged notes would go, as boxes over the canvas
    const previews: React.CSSProperties[] = []
    if (drag && drag.mode !== "select") {
        const z = zoom()
        for (const note of selectedNotes) {
            const time = note.time + drag.time
            const length = Math.max(1, note.event.Note.length + drag.length)
            previews.push({
                left: time / z,
                top: (HIGHEST_PITCH - Math.min(HIGHEST_PITCH, Math.max(LOWEST_PITCH, note.event.Note.pitch + drag.pitch))) * NOTE_HEIGHT,
                width: Math.max(2, length / z),
                height: NOTE_HEIGHT,
            })
        }
    }

    return <div
        ref={containerRef}
        tabIndex={0}
        style={{ position: "relative", outline: "none" }}
        onKeyDown={event => {
            const command = event.metaKey || event.ctrlKey
            if (event.key === "Delete" || event.key === "Backspace") {
                if (selectedNotes.length > 0) {
                    deleteNotes(selectedNotes.map(note => note.event.id))
                }
            } else if (command && event.key === "a") {
                select(notes.map(note => note.event.id))
            } else if (command && event.key === "c") {
                if (selectedNotes.length > 0) {
                    clipboard = copy(selectedNotes)
                }
            } else if (command && event.key === "v") {
                const start = (playhead?.start ?? segmentStart) - segmentStart
                paste(Math.max(0, start))
            } else if (command && event.key === "d") {
                if (selectedNotes.length > 0) {
                    const end = Math.max(...selectedNotes.map(note => note.time + note.event.Note.length))
                    paste(end, copy(selectedNotes))
                }
            } else if (!command && event.key === "q") {
                dispatch({
                    type: "place_track_commands",
                    ...target,
                    places: selectedNotes.map(note => ({ id: note.event.id, time: snap(note.time), command: noteCommand(note, {}) })),
                })
            } else {
                return
            }
            event.preventDefault()
        }}
    >
        <canvas
            ref={canvas.ref}
            style={{ width: "100%", height: "100%", display: "block", touchAction: "none", cursor: "crosshair" }}
            title="Double-click to add a note. Click a note to select it, or drag across notes to select them. Drag selected notes to move them, or their ends to resize them. Press Delete to delete them, or Q to snap them to the grid. Hold Shift to place freely."
            data-no-drag-scroll
            onPointerDown={event => {
                if (event.button !== 0) return
                containerRef.current!.focus()
                event.currentTarget.setPointerCapture(event.pointerId)
                const { x, y } = localPoint(event)
                const note = noteAt(x, y)
                if (!note) {
                    setDrag({ mode: "select", startX: x, startY: y, x, y, add: event.shiftKey })
                    return
                }
                if (event.shiftKey) {
                    const ids = selectedIds.includes(note.event.id)
                        ? selectedIds.filter(id => id !== note.event.id)
                        : [...selectedIds, note.event.id]
                    select(ids)
                    return
                }
                if (!selectedIds.includes(note.event.id)) {
                    select([note.event.id])
                }
                const end = (note.time + note.event.Note.length) / zoom()
                setDrag({
                    mode: end - x <= RESIZE_EDGE ? "resize" : "move",
                    note,
                    startX: event.clientX,
                    startY: event.clientY,
                    time: 0,
                    pitch: 0,
                    length: 0,
                })
            }}
            onPointerMove={event => {
                if (!drag) return
                if (drag.mode === "select") {
                    const { x, y } = localPoint(event)
                    setDrag({ ...drag, x, y })
                    return
                }
                const dx = (event.clientX - drag.startX) * zoom()
                const dy = event.clientY - drag.startY
                if (drag.mode === "move") {
                    setDrag({
                        ...drag,
                        time: Math.max(-Math.min(...selectedNotes.map(note => note.time)), snap(drag.note.time + dx, event.shiftKey) - drag.note.time),
                        pitch: -Math.round(dy / NOTE_HEIGHT),
                    })
                } else {
                    const end = snap(drag.note.time + drag.note.event.Note.length + dx, event.shiftKey)
                    setDrag({ ...drag, length: Math.max(1, end - drag.note.time) - drag.note.event.Note.length })
                }
            }}
            onPointerUp={() => {
                if (!drag) return
                if (drag.mode === "select") {
                    const z = zoom()
                    const [left, right] = [Math.min(drag.startX, drag.x) * z, Math.max(drag.startX, drag.x) * z]
                    const [top, bottom] = [pitchAt(Math.min(drag.startY, drag.y)), pitchAt(Math.max(drag.startY, drag.y))]
                    const boxed = notes.filter(note => note.time <= right && note.time + note.event.Note.length >= left &&
                        note.event.Note.pitch <= top && note.event.Note.pitch >= bottom).map(note => note.event.id)
                    select(drag.add ? [...new Set([...selectedIds, ...boxed])] : boxed)
                } else if (drag.time !== 0 || drag.pitch !== 0 || drag.length !== 0) {
                    dispatch({
                        type: "place_track_commands",
                        ...target,
                        places: selectedNotes.map(note => ({
                            id: note.event.id,
                            time: note.time + drag.time,
                            command: noteCommand(note, {
                                pitch: Math.min(HIGHEST_PITCH, Math.max(LOWEST_PITCH, note.event.Note.pitch + drag.pitch)),
                                length: Math.max(1, note.event.Note.length + drag.length),
                            }),
                        })),
                    })
                }
                setDrag(null)
            }}
            onDoubleClick={event => {
                const { x, y } = localPoint(event)
                const note = noteAt(x, y)
                if (note) {
                    deleteNotes([note.event.id])
                    return
                }
                dispatch({
                    type: "insert_track_command",
                    ...target,
                    time: snap(x * zoom(), event.shiftKey),
                    command: {
                        Note: {
                            pitch: pitchAt(y),
                            velocity: selectedNotes[0]?.event.Note.velocity ?? DEFAULT_VELOCITY,
                            length: selectedNotes[0]?.event.Note.length ?? grid,
                        },
                    },
                })
            }}
        />
        {previews.map((style, i) => <div
            key={i}
            style={{
                position: "absolute",
                boxSizing: "border-box",
                border: "1px dashed #f9e2af",
                borderRadius: 2,
                pointerEvents: "none",
                ...style,
            }}
        />)}
        {drag?.mode === "select" && <div
            style={{
                position: "absolute",
                left: Math.min(drag.startX, drag.x),
                top: Math.min(drag.startY, drag.y),
                width: Math.abs(drag.x - drag.startX),
                height: Math.abs(drag.y - drag.startY),
                border: "1px solid #f9e2af",
                background: "rgb(249 226 175 / 12%)",
                pointerEvents: "none",
            }}
        />}
    </div>
}
