import { createContext, useContext, useEffect, useRef } from "react"

import { useSegmentLengths } from "./Ruler"

import { useDoc } from "../store"
import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM } from "../store/doc"

/** Wheel movement, in pixels, that doubles or halves the zoom. A mouse wheel's notch is about 100. */
const WHEEL_PIXELS_PER_DOUBLING = 300

/** Pixels in a line or a page of wheel movement, for wheels that report those. */
const WHEEL_LINE_PIXELS = 33
const WHEEL_PAGE_PIXELS = 800

/**
 * Sets the timeline's zoom to `newZoom` ticks per pixel, keeping the time at `clientX` in place, or the time in the
 * middle of the timeline if not given.
 */
export function zoomTimeline(dispatch: (action: { type: "set_zoom", zoom: number }) => void, oldZoom: number, newZoom: number, clientX?: number) {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom))
    const grids = [...document.querySelectorAll<HTMLElement>("[data-time-provider] [data-time-grid]")]
    // The widest grid is the one the tracks are in
    const grid = grids.reduce<HTMLElement | undefined>((widest, el) => (!widest || el.clientWidth > widest.clientWidth ? el : widest), undefined)
    if (!grid) {
        dispatch({ type: "set_zoom", zoom })
        return
    }
    const rect = grid.getBoundingClientRect()
    const offset = Math.min(grid.clientWidth, Math.max(0, (clientX ?? rect.left + grid.clientWidth / 2) - rect.left))
    const ticks = (grid.scrollLeft + offset) * oldZoom

    dispatch({ type: "set_zoom", zoom })
    // Once the timeline has been laid out at the new zoom, scroll the time back to where it was
    requestAnimationFrame(() => {
        const scrollLeft = Math.max(0, ticks / zoom - offset)
        for (const el of grids) {
            el.scrollLeft = scrollLeft
        }
    })
}

export interface Time {
    xToTicks(clientX: number): number
}

const TIME_CTX = createContext<Time | null>(null)

export function useTime(): Time {
    const time = useContext(TIME_CTX)

    if (!time) {
        return {
            xToTicks(_: number): number {
                throw new Error("TimeProvider missing in tree")
            },
        }
    }

    return time
}

export default function TimeProvider({ children }: { children: React.ReactNode }) {
    const segmentLengths = useSegmentLengths()
    const totalLength = segmentLengths.reduce((acc, len) => acc + len, 0)

    const container = useRef<HTMLDivElement | null>(null)
    const [doc, dispatch] = useDoc()
    const zoom = doc?.zoom ?? DEFAULT_ZOOM
    // Events can arrive faster than the zoom renders, so each builds on the last one's zoom
    const zoomRef = useRef(zoom)
    zoomRef.current = zoom
    const dispatchRef = useRef(dispatch)
    dispatchRef.current = dispatch

    // Ctrl or Cmd with the mouse wheel zooms around the pointer, as does pinching on a trackpad, which browsers report
    // as the wheel with Ctrl. React's wheel handlers are passive and can't stop the browser zooming the page, so listen
    // directly.
    useEffect(() => {
        const el = container.current
        if (!el) return
        const zoomTo = (newZoom: number, clientX: number) => {
            const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom))
            zoomTimeline(dispatchRef.current, zoomRef.current, clamped, clientX)
            zoomRef.current = clamped
        }
        const onWheel = (event: WheelEvent) => {
            if (!event.ctrlKey && !event.metaKey) return
            event.preventDefault()
            const pixels = event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_LINE
                ? WHEEL_LINE_PIXELS
                : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? WHEEL_PAGE_PIXELS : 1)
            zoomTo(zoomRef.current * Math.pow(2, pixels / WHEEL_PIXELS_PER_DOUBLING), event.clientX)
        }
        // Safari reports trackpad pinches as gestures, with how far the fingers have spread since they started
        type GestureEvent = UIEvent & { scale: number, clientX: number }
        let gestureStartZoom = zoomRef.current
        const onGestureStart = (event: Event) => {
            event.preventDefault()
            gestureStartZoom = zoomRef.current
        }
        const onGestureChange = (event: Event) => {
            event.preventDefault()
            const gesture = event as GestureEvent
            zoomTo(gestureStartZoom / gesture.scale, gesture.clientX)
        }
        el.addEventListener("wheel", onWheel, { passive: false })
        el.addEventListener("gesturestart", onGestureStart)
        el.addEventListener("gesturechange", onGestureChange)
        return () => {
            el.removeEventListener("wheel", onWheel)
            el.removeEventListener("gesturestart", onGestureStart)
            el.removeEventListener("gesturechange", onGestureChange)
        }
    }, [])

    return <TIME_CTX.Provider value={{
        xToTicks(clientX: number): number {
            if (!container.current) return NaN
            const scrollLeft = container.current.querySelector("[data-time-grid]")?.scrollLeft ?? 0
            const px = clientX - container.current.getBoundingClientRect().left + scrollLeft
            const style = getComputedStyle(container.current)
            const rulerZoom = parseFloat(style.getPropertyValue("--ruler-zoom"))

            const ticks = (px - 225) * rulerZoom
            if (ticks < 0) return 0
            if (ticks > totalLength) return totalLength
            return ticks
        },
    }}>
        <div ref={container} style={{ "--ruler-zoom": zoom, "height": "100%" } as any} data-time-provider>
            {children}
        </div>
    </TIME_CTX.Provider>
}
