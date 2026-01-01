import React, { useCallback, useEffect, useRef } from "react"

export type Axis = "none" | "x" | "y" | "both"

export type DragScrollOptions = {
  axis?: Axis
  button?: number // 0=left, 1=middle, 2=right
  thresholdPx?: number // movement before we commit to panning

  cursor?: string // default: "grab"
  activeCursor?: string // default: "grabbing"
}

export default function useDragToScroll<T extends HTMLElement>(
    opts: DragScrollOptions = {},
) {
    const {
        axis = "both",
        button = 1,
        thresholdPx = 4,
        cursor = "grab",
        activeCursor = "grabbing",
    } = opts

    const ref = useRef<T | null>(null)
    const rafId = useRef<number | null>(null)

    const st = useRef({
        active: false,
        dragging: false,
        moved: false,
        pointerId: -1,

        lastX: 0,
        lastY: 0,

        pendX: 0,
        pendY: 0,

        accumDx: 0,
        accumDy: 0,

        prevCursor: "" as string,
    })

    const stopRaf = useCallback(() => {
        if (rafId.current != null) {
            cancelAnimationFrame(rafId.current)
            rafId.current = null
        }
    }, [])

    const setCursor = useCallback((value: string | null) => {
        const el = ref.current
        if (!el) return
        if (value == null) {
            el.style.cursor = st.current.prevCursor
        } else {
            el.style.cursor = value
        }
    }, [])

    const applyPending = useCallback(() => {
        if (rafId.current != null) return
        rafId.current = requestAnimationFrame(() => {
            rafId.current = null
            const el = ref.current
            if (!el) return
            const s = st.current
            if (!s.dragging) return

            if (axis === "x" || axis === "both") el.scrollLeft += s.pendX
            if (axis === "y" || axis === "both") el.scrollTop += s.pendY

            s.pendX = 0
            s.pendY = 0
        })
    }, [axis])

    const end = useCallback(() => {
        const s = st.current
        const wasDragging = s.dragging

        s.active = false
        s.dragging = false
        s.pointerId = -1

        s.pendX = 0
        s.pendY = 0
        s.accumDx = 0
        s.accumDy = 0

        document.documentElement.style.userSelect = ""
        ;(document.documentElement.style as any).webkitUserDrag = ""

        if (wasDragging) setCursor(null)
    }, [setCursor])

    const onPointerDownCapture = useCallback(
        (e: React.PointerEvent) => {
            if (axis === "none") return
            if (e.button !== button) return

            const el = ref.current
            if (!el) return

            stopRaf()

            const s = st.current
            s.active = true
            s.dragging = false
            s.moved = false
            s.pointerId = e.pointerId

            s.lastX = e.clientX
            s.lastY = e.clientY

            s.pendX = 0
            s.pendY = 0
            s.accumDx = 0
            s.accumDy = 0

            // store existing inline cursor so we can restore it
            s.prevCursor = el.style.cursor
            // show "grab" as soon as the pan gesture is armed
            el.style.cursor = cursor

            el.setPointerCapture(e.pointerId)

            e.preventDefault()
            e.stopPropagation()
        },
        [axis, button, stopRaf, cursor],
    )

    const onPointerMove = useCallback(
        (e: React.PointerEvent) => {
            const el = ref.current
            const s = st.current
            if (!el || !s.active || e.pointerId !== s.pointerId) return

            const dx = e.clientX - s.lastX
            const dy = e.clientY - s.lastY

            if (!s.dragging) {
                s.accumDx += dx
                s.accumDy += dy

                const primary =
          axis === "x"
              ? Math.abs(s.accumDx)
              : axis === "y"
                  ? Math.abs(s.accumDy)
                  : Math.max(Math.abs(s.accumDx), Math.abs(s.accumDy))

                if (primary < thresholdPx) {
                    s.lastX = e.clientX
                    s.lastY = e.clientY
                    return
                }

                s.dragging = true
                s.moved = true

                document.documentElement.style.userSelect = "none"
                ;(document.documentElement.style as any).webkitUserDrag = "none"

                // now that we're actually dragging, show "grabbing"
                el.style.cursor = activeCursor
            }

            if (axis === "x" || axis === "both") s.pendX += -dx
            if (axis === "y" || axis === "both") s.pendY += -dy

            s.lastX = e.clientX
            s.lastY = e.clientY

            applyPending()
            e.preventDefault()
        },
        [axis, thresholdPx, applyPending, activeCursor],
    )

    const onPointerUp = useCallback(
        (e: React.PointerEvent) => {
            const el = ref.current
            if (el) {
                try {
                    el.releasePointerCapture(e.pointerId)
                } catch {}
            }
            end()
        },
        [end],
    )

    const onPointerCancel = useCallback(() => {
        end()
    }, [end])

    const onClickCapture = useCallback((e: React.MouseEvent) => {
        if (st.current.moved) {
            st.current.moved = false
            e.preventDefault()
            e.stopPropagation()
        }
    }, [])

    const onDragStartCapture = useCallback((e: React.DragEvent) => {
        if (st.current.active && st.current.dragging) {
            e.preventDefault()
            e.stopPropagation()
        }
    }, [])

    const onMouseDownCapture = useCallback(
        (e: React.MouseEvent) => {
            if (axis !== "none" && e.button === button) e.preventDefault()
        },
        [axis, button],
    )

    useEffect(() => {
        const el = ref.current
        if (!el) return

        el.style.touchAction =
      axis === "none" ? "auto" : axis === "x" ? "pan-y" : axis === "y" ? "pan-x" : "none"

        return () => {
            stopRaf()
            end()
        }
    }, [axis, stopRaf, end])

    return {
        ref,
        onMouseDownCapture,
        onPointerDownCapture,
        onPointerMove,
        onPointerUp,
        onPointerCancel,
        onClickCapture,
        onDragStartCapture,
    } as const
}
