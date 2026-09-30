import { type Bgm, type Event, type Track } from "pm64-typegen"
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { getUntrackedObject } from "react-tracked"

import FixedPopover, { MenuItem, MenuList } from "./FixedPopover"
import { timeline } from "./lanes"
import { HIGHEST_PITCH, LOWEST_PITCH, NOTE_HEIGHT } from "./pitches"
import { PitchLimit } from "./pitchLimit"
import { CONTEXT as PLAYHEAD_CONTEXT } from "./Playhead"
import { usePickup, useTicksPerBar } from "./Ruler"
import { SNAP_NAMES, useSnap } from "./snap"

import Bridge from "../bridge"
import { useBgm, useDoc, useLocation } from "../store"
import { useSelectedIds } from "../store/doc"
import { useSize } from "../util/hooks/useSize"

/** Pixels from a note's end that resize it rather than move it. */
const RESIZE_EDGE = 6

const DEFAULT_VELOCITY = 100

/** The most time between two presses, in milliseconds, for them to be a double-click. */
const DOUBLE_PRESS_TIME = 400

/** The most a pointer moves between two presses, in pixels, for them to be a double-click. */
const DOUBLE_PRESS_DISTANCE = 5

/** How far a pointer moves after a double-click, in pixels, before the drag sets the new note's length. */
const CREATE_DRAG_DISTANCE = 4

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

    return <Canvas
        trackListId={trackListId}
        trackIndex={trackIndex}
        track={track}
        branches={bgm.branches}
        mix={location.mix}
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
} | {
    mode: "create"
    startX: number
    /** The new note's time, pitch, and length. */
    time: number
    pitch: number
    length: number
    /** Whether the pointer has moved far enough for the drag to set the length. */
    isSizing: boolean
}

/** Notes copied from a track, relative to the first one's time. */
let clipboard: { offset: number, pitch: number, velocity: number, length: number }[] = []

/** The length and velocity of the note last selected, added, or resized, which new notes are given. */
let lastNote: { length: number, velocity: number } | null = null

/** The key held for shortcuts, as shown beside the actions they do. */
const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+"

/**
 * Draws the track's notes and edits them. Double-click empty space to add a note as long as the note last selected,
 * added, or resized, or hold the second click and drag to set its length. Double-click a note to delete it. Click a
 * note to select it, Shift-click to add it to the selection, or drag across empty space to select the notes in a box.
 * Drag selected notes to move them, or their ends to resize them. Right-click for what can be done with the selected
 * notes, which the usual shortcuts also do, and Q quantizes them, moving each to the nearest grid line. Notes snap to
 * the grid unless Shift is held.
 */
function Canvas({ trackListId, trackIndex, track, branches, mix, segmentStart, pitchLimits }: {
    trackListId: number
    trackIndex: number
    track: Track
    branches: Bgm["branches"]
    mix: number
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
    const [snapSetting, snap, grid] = useSnap()
    const ticksPerBar = useTicksPerBar()
    const pickup = usePickup()
    const playhead = useContext(PLAYHEAD_CONTEXT)
    const [drag, setDrag] = useState<Drag | null>(null)
    // Where and when the pointer was last pressed, to tell a double-click from its second press
    const lastPress = useRef<{ time: number, x: number, y: number } | null>(null)
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

    // How long a note being added at `time` is when dragged to `x`: at least a grid step, or a tick when placing freely
    const createdLength = (time: number, x: number, free: boolean) => {
        const end = snap(x * zoom(), free)
        return end > time ? end - time : free ? 1 : grid
    }
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

    const hasSelection = selectedNotes.length > 0
    const copySelected = () => {
        if (hasSelection) {
            clipboard = copy(selectedNotes)
        }
    }
    const deleteSelected = () => {
        if (hasSelection) {
            deleteNotes(selectedNotes.map(note => note.event.id))
        }
    }
    const cutSelected = () => {
        copySelected()
        deleteSelected()
    }
    const duplicateSelected = () => {
        if (hasSelection) {
            paste(Math.max(...selectedNotes.map(note => note.time + note.event.Note.length)), copy(selectedNotes))
        }
    }
    const selectAll = () => select(notes.map(note => note.event.id))
    const quantizeSelected = () => dispatch({
        type: "place_track_commands",
        ...target,
        places: selectedNotes.map(note => ({ id: note.event.id, time: snap(note.time), command: noteCommand(note, {}) })),
    })

    // The context menu, where it opened, and the time there, which pasting puts the notes at
    const [menu, setMenu] = useState<{ anchor: DOMRect, time: number } | null>(null)
    const menuItems: MenuItem[] = menu ? [
        { label: "Cut", shortcut: `${MOD}X`, isDisabled: !hasSelection, onAction: cutSelected },
        { label: "Copy", shortcut: `${MOD}C`, isDisabled: !hasSelection, onAction: copySelected },
        { label: "Paste here", isDisabled: clipboard.length === 0, onAction: () => paste(menu.time) },
        { label: "Duplicate", shortcut: `${MOD}D`, isDisabled: !hasSelection, onAction: duplicateSelected },
        { label: "Delete", shortcut: "Delete", isDisabled: !hasSelection, onAction: deleteSelected },
        "separator",
        { label: "Select all", shortcut: `${MOD}A`, isDisabled: notes.length === 0, onAction: selectAll },
        {
            label: snapSetting === "off" ? "Quantize" : `Quantize to ${SNAP_NAMES[snapSetting].toLowerCase()}`,
            shortcut: "Q",
            // Nothing moves if the grid is off or the notes are on it already
            isDisabled: snapSetting === "off" || selectedNotes.every(note => snap(note.time) === note.time),
            onAction: quantizeSelected,
        },
    ] : []

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
        rendererRef.current?.set_track(untracked(track), untracked(branches), mix)
    }, [track, branches, mix])

    useEffect(() => {
        // 0 is no limit, as it isn't a pitch the engine plays
        rendererRef.current?.set_pitch_limits(
            new Uint32Array(pitchLimits.map(({ time }) => time)),
            new Uint8Array(pitchLimits.map(({ limit }) => limit ?? 0)),
        )
    }, [pitchLimits])

    useEffect(() => {
        // Bar 1 starts after the pickup, so a segment's bars start where the song's do
        rendererRef.current?.set_bars(ticksPerBar, (((pickup - segmentStart) % ticksPerBar) + ticksPerBar) % ticksPerBar)
    }, [ticksPerBar, pickup, segmentStart])

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
    if (drag?.mode === "create") {
        const z = zoom()
        previews.push({
            left: drag.time / z,
            top: (HIGHEST_PITCH - drag.pitch) * NOTE_HEIGHT,
            width: Math.max(2, drag.length / z),
            height: NOTE_HEIGHT,
        })
    } else if (drag && drag.mode !== "select") {
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
                deleteSelected()
            } else if (command && event.key === "a") {
                selectAll()
            } else if (command && event.key === "c") {
                copySelected()
            } else if (command && event.key === "x") {
                cutSelected()
            } else if (command && event.key === "v") {
                const start = (playhead?.start ?? segmentStart) - segmentStart
                paste(Math.max(0, start))
            } else if (command && event.key === "d") {
                duplicateSelected()
            } else if (!command && event.key === "q") {
                quantizeSelected()
            } else {
                return
            }
            event.preventDefault()
        }}
    >
        <canvas
            ref={canvas.ref}
            style={{ width: "100%", height: "100%", display: "block", touchAction: "none", cursor: "crosshair" }}
            data-no-drag-scroll
            onContextMenu={event => {
                event.preventDefault()
                containerRef.current!.focus()
                const { x, y } = localPoint(event)
                const note = noteAt(x, y)
                // Right-clicking a note acts on it, unless it's one of the notes already selected
                if (note && !selectedIds.includes(note.event.id)) {
                    select([note.event.id])
                }
                setMenu({ anchor: new DOMRect(event.clientX, event.clientY, 0, 0), time: snap(x * zoom(), event.shiftKey) })
            }}
            onPointerDown={event => {
                if (event.button !== 0) return
                containerRef.current!.focus()
                event.currentTarget.setPointerCapture(event.pointerId)
                const { x, y } = localPoint(event)
                const note = noteAt(x, y)
                const previous = lastPress.current
                const isDoubleClick = previous !== null && event.timeStamp - previous.time < DOUBLE_PRESS_TIME &&
                    Math.hypot(x - previous.x, y - previous.y) < DOUBLE_PRESS_DISTANCE
                lastPress.current = isDoubleClick ? null : { time: event.timeStamp, x, y }
                if (isDoubleClick && note) {
                    deleteNotes([note.event.id])
                    return
                }
                if (isDoubleClick) {
                    const pitch = pitchAt(y)
                    if (pitch < LOWEST_PITCH || pitch > HIGHEST_PITCH) return
                    const length = selectedNotes[0]?.event.Note.length ?? lastNote?.length ?? grid
                    setDrag({ mode: "create", startX: x, time: snap(x * zoom(), event.shiftKey), pitch, length, isSizing: false })
                    return
                }
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
                lastNote = { length: note.event.Note.length, velocity: note.event.Note.velocity }
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
                if (drag.mode === "create") {
                    const { x } = localPoint(event)
                    if (!drag.isSizing && Math.abs(x - drag.startX) < CREATE_DRAG_DISTANCE) return
                    setDrag({ ...drag, length: createdLength(drag.time, x, event.shiftKey), isSizing: true })
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
            onPointerUp={event => {
                if (!drag) return
                if (drag.mode === "create") {
                    // Where the pointer is let go, as the last move might not have been drawn yet
                    const length = drag.isSizing ? createdLength(drag.time, localPoint(event).x, event.shiftKey) : drag.length
                    const velocity = selectedNotes[0]?.event.Note.velocity ?? lastNote?.velocity ?? DEFAULT_VELOCITY
                    lastNote = { length, velocity }
                    dispatch({
                        type: "insert_track_command",
                        ...target,
                        time: drag.time,
                        command: { Note: { pitch: drag.pitch, velocity, length } },
                    })
                } else if (drag.mode === "select") {
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
                    if (drag.mode === "resize") {
                        const { length, velocity } = drag.note.event.Note
                        lastNote = { length: Math.max(1, length + drag.length), velocity }
                    }
                }
                setDrag(null)
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
        {menu && <FixedPopover anchor={menu.anchor} onClose={() => setMenu(null)}>
            <MenuList label="Notes" items={menuItems} onClose={() => setMenu(null)} />
        </FixedPopover>}
    </div>
}
