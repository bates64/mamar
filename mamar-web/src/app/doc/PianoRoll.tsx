import { type Bgm, type Event, type Track } from "pm64-typegen"
import { useEffect, useMemo, useRef, useState } from "react"

import { timeline } from "./lanes"
import { useSnap } from "./snap"

import Bridge from "../bridge"
import { useBgm, useDoc, useLocation } from "../store"
import { alternatePartOf } from "../store/bgm"
import { useSize } from "../util/hooks/useSize"

/** Height of a note's row, in CSS pixels. Matches the renderer. */
const NOTE_HEIGHT = 12

/** The highest pitch, at the top of the roll. Matches the renderer. */
const HIGHEST_PITCH = 255

/** Pixels from a note's end that resize it rather than move it. */
const RESIZE_EDGE = 6

const DEFAULT_VELOCITY = 100

export interface Props {
    trackListId: number
    trackIndex: number
}

export default function PianoRoll({ trackListId, trackIndex }: Props) {
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
    />
}

interface NoteAt {
    event: Event & { Note: { pitch: number, velocity: number, length: number } }
    time: number
}

interface Drag {
    note: NoteAt
    mode: "move" | "resize"
    startX: number
    startY: number
    time: number
    pitch: number
    length: number
}

/**
 * Draws the track's notes. Click empty space to add a note, click a note to select it, drag it to move it or its end to
 * resize it, and double-click it or press Delete to delete it. Notes snap to the grid unless Shift is held.
 */
function Canvas({ trackListId, trackIndex, track, branches, mix, behind }: {
    trackListId: number
    trackIndex: number
    track: Track
    branches: Bgm["branches"]
    mix: number
    behind: Track | null
}) {
    const canvas = useSize<HTMLCanvasElement>()
    const containerRef = useRef<HTMLDivElement | null>(null)
    type Renderer = InstanceType<typeof Bridge.PianoRoll>
    const rendererRef = useRef<Renderer | null>(null)
    const rafRef = useRef<number>(0)
    const [doc, docDispatch] = useDoc()
    const [, dispatch] = useBgm()
    const [, snap, grid] = useSnap()
    const [drag, setDrag] = useState<Drag | null>(null)
    const target = { trackList: trackListId, track: trackIndex }

    const notes: NoteAt[] = useMemo(
        () => timeline(track.commands).filter((played): played is NoteAt => "Note" in played.event),
        [track.commands],
    )
    const selection = doc?.selection
    const selectedId = selection?.trackList === trackListId && selection.track === trackIndex ? selection.event : undefined
    const selectedNote = notes.find(note => note.event.id === selectedId)

    const zoom = () => parseFloat(getComputedStyle(canvas.ref.current!).getPropertyValue("--ruler-zoom")) || 2
    const noteAt = (x: number, y: number) => {
        const ticks = x * zoom()
        const pitch = HIGHEST_PITCH - Math.floor(y / NOTE_HEIGHT)
        return [...notes].reverse().find(note => note.event.Note.pitch === pitch &&
            ticks >= note.time && ticks <= note.time + Math.max(note.event.Note.length, RESIZE_EDGE * zoom()))
    }
    const deleteNote = (note: NoteAt) => {
        const index = Bridge.commands_without_detours(track.commands).findIndex((event: Event) => event.id === note.event.id)
        if (index >= 0) {
            dispatch({ type: "delete_track_command", ...target, index })
            docDispatch({ type: "set_selection", selection: null })
        }
    }

    // init once (after canvas exists)
    useEffect(() => {
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

    useEffect(() => {
        rendererRef.current?.set_track(track, branches, mix, behind)
    }, [track, branches, mix, behind])

    useEffect(() => {
        rendererRef.current?.set_selection(new Uint32Array(selectedId !== undefined ? [selectedId] : []))
    }, [selectedId])

    // Centre on the notes when a track opens, but not when it's edited
    useEffect(() => {
        const r = rendererRef.current
        if (!r) return
        containerRef.current!.style.height = `${r.scroll_height()}px`
        const scrollParent = containerRef.current!.parentElement!
        scrollParent.scrollTop = r.central_scroll_y() / window.devicePixelRatio
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trackListId, trackIndex])

    const previewStyle = (d: Drag): React.CSSProperties => {
        const z = zoom()
        return {
            left: d.time / z,
            top: (HIGHEST_PITCH - d.pitch) * NOTE_HEIGHT,
            width: Math.max(2, d.length / z),
            height: NOTE_HEIGHT,
        }
    }

    return <div
        ref={containerRef}
        tabIndex={0}
        style={{ position: "relative", outline: "none" }}
        onKeyDown={event => {
            if ((event.key === "Delete" || event.key === "Backspace") && selectedNote) {
                deleteNote(selectedNote)
                event.preventDefault()
            }
        }}
    >
        <canvas
            ref={canvas.ref}
            style={{ width: "100%", height: "100%", display: "block", touchAction: "none", cursor: "crosshair" }}
            data-no-drag-scroll
            onPointerDown={event => {
                if (event.button !== 0) return
                const x = event.nativeEvent.offsetX
                const y = event.nativeEvent.offsetY
                const note = noteAt(x, y)
                if (note) {
                    docDispatch({ type: "set_selection", selection: { ...target, event: note.event.id } })
                    const end = (note.time + note.event.Note.length) / zoom()
                    event.currentTarget.setPointerCapture(event.pointerId)
                    setDrag({
                        note,
                        mode: end - x <= RESIZE_EDGE ? "resize" : "move",
                        startX: event.clientX,
                        startY: event.clientY,
                        time: note.time,
                        pitch: note.event.Note.pitch,
                        length: note.event.Note.length,
                    })
                } else {
                    const pitch = HIGHEST_PITCH - Math.floor(y / NOTE_HEIGHT)
                    dispatch({
                        type: "insert_track_command",
                        ...target,
                        time: snap(x * zoom(), event.shiftKey),
                        command: {
                            Note: {
                                pitch,
                                velocity: selectedNote?.event.Note.velocity ?? DEFAULT_VELOCITY,
                                length: selectedNote?.event.Note.length ?? grid,
                            },
                        },
                    })
                }
            }}
            onPointerMove={event => {
                if (!drag) return
                const dx = (event.clientX - drag.startX) * zoom()
                const dy = event.clientY - drag.startY
                if (drag.mode === "move") {
                    setDrag({
                        ...drag,
                        time: snap(drag.note.time + dx, event.shiftKey),
                        pitch: Math.min(HIGHEST_PITCH, Math.max(0, drag.note.event.Note.pitch - Math.round(dy / NOTE_HEIGHT))),
                    })
                } else {
                    const end = snap(drag.note.time + drag.note.event.Note.length + dx, event.shiftKey)
                    setDrag({ ...drag, length: Math.max(1, end - drag.note.time) })
                }
            }}
            onPointerUp={() => {
                if (!drag) return
                const { note } = drag
                if (drag.time !== note.time || drag.pitch !== note.event.Note.pitch || drag.length !== note.event.Note.length) {
                    dispatch({
                        type: "place_track_command",
                        ...target,
                        id: note.event.id,
                        time: drag.time,
                        command: { Note: { ...note.event.Note, pitch: drag.pitch, length: drag.length } },
                    })
                }
                setDrag(null)
            }}
            onDoubleClick={event => {
                const note = noteAt(event.nativeEvent.offsetX, event.nativeEvent.offsetY)
                if (note) {
                    deleteNote(note)
                }
            }}
        />
        {drag && <div
            style={{
                position: "absolute",
                boxSizing: "border-box",
                border: "1px dashed #f9e2af",
                borderRadius: 2,
                pointerEvents: "none",
                ...previewStyle(drag),
            }}
        />}
    </div>
}
