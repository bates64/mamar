import React, { useEffect, useMemo, useCallback } from "react"

import { useSegmentLengths } from "./Ruler"

import useDragToScroll, { type DragScrollOptions } from "../util/hooks/useDragToScroll"

type ScrollEl = HTMLDivElement

type Bus = {
    els: Set<ScrollEl>
    raf: number | null
    pendingLeft: number

    // sync lock (fixes feedback loop)
    syncing: boolean
    source: ScrollEl | null
}

const buses = new Map<string, Bus>()

function getBus(key: string): Bus {
    let bus = buses.get(key)
    if (!bus) {
        bus = {
            els: new Set(),
            raf: null,
            pendingLeft: 0,
            syncing: false,
            source: null,
        }
        buses.set(key, bus)
    }
    return bus
}

// Sets up a horizontal CSS grid such that column N is segment N.
// TimeGrids with the same `syncKey` have their scrollLeft position synced with each other.
export default function TimeGrid({
    children,
    syncKey = "TimeGrid",
    className,
    style: styleProp,
    dragToScroll = { axis: "none" },
}: {
    children: React.ReactNode
    syncKey?: string
    className?: string
    style?: React.CSSProperties
    dragToScroll?: DragScrollOptions
}) {
    const segmentLengths = useSegmentLengths()

    const { outerStyle, gridStyle } = useMemo(() => {
        const totalLength = segmentLengths.reduce((acc, len) => acc + len, 0)

        const outerStyle: React.CSSProperties = {
            overflowX: "scroll",
            overflowY: "hidden",
            display: "flex",
            scrollbarWidth: "none",
            ...styleProp,
        }

        const gridStyle: React.CSSProperties = {
            display: "grid",
            gridTemplateColumns: segmentLengths
                .map(length => `calc(${length}px / var(--ruler-zoom))`)
                .join(" "),
            width: `calc(${totalLength}px / var(--ruler-zoom))`,
        }

        return { outerStyle, gridStyle }
    }, [segmentLengths, styleProp])

    const drag = useDragToScroll<ScrollEl>(dragToScroll)
    const scrollRef = drag.ref

    useEffect(() => {
        const el = scrollRef.current
        if (!el) return
        const bus = getBus(syncKey)
        bus.els.add(el)
        el.scrollLeft = bus.pendingLeft
        return () => {
            bus.els.delete(el)
            if (bus.source === el) bus.source = null
            if (bus.els.size === 0) buses.delete(syncKey)
        }
    }, [syncKey, scrollRef])

    const onScroll = useCallback(() => {
        const el = scrollRef.current
        if (!el) return

        const bus = getBus(syncKey)

        // If a sync frame is ongoing and this isn't the source, ignore.
        if (bus.syncing && bus.source !== el) return

        // This element becomes the source for this frame.
        bus.source = el
        bus.syncing = true
        bus.pendingLeft = el.scrollLeft

        if (bus.raf != null) return
        bus.raf = requestAnimationFrame(() => {
            bus.raf = null
            const left = bus.pendingLeft

            for (const other of bus.els) {
                if (other === bus.source) continue
                if (other.scrollLeft === left) continue
                other.scrollLeft = left
            }

            bus.syncing = false
            bus.source = null
        })
    }, [syncKey, scrollRef])

    return (
        <div className={className} style={outerStyle} onScroll={onScroll} {...drag}>
            <div style={gridStyle}>{children}</div>
        </div>
    )
}
