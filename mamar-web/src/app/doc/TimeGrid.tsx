import React, { useEffect, useMemo, useRef, useCallback } from "react"

import { useSegmentLengths } from "./Ruler"

type ScrollEl = HTMLDivElement

type Bus = {
    els: Set<ScrollEl>
    active: ScrollEl | null
    raf: number | null
    pendingLeft: number
}

const buses = new Map<string, Bus>()

function getBus(key: string): Bus {
    let bus = buses.get(key)
    if (!bus) {
        bus = { els: new Set(), active: null, raf: null, pendingLeft: 0 }
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
}: {
    children: React.ReactNode
    syncKey?: string
    className?: string
    style?: React.CSSProperties
}) {
    const segmentLengths = useSegmentLengths()

    const { outerStyle, gridStyle } = useMemo(() => {
        const totalLength = segmentLengths.reduce((acc, len) => acc + len, 0)

        const outerStyle: React.CSSProperties = {
            overflowX: "scroll",
            overflowY: "hidden",
            display: "flex",
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

    const scrollRef = useRef<ScrollEl | null>(null)
    const isApplying = useRef(false)

    useEffect(() => {
        const el = scrollRef.current
        if (!el) return
        const bus = getBus(syncKey)
        bus.els.add(el)
        el.scrollLeft = bus.pendingLeft
        return () => {
            bus.els.delete(el)
            if (bus.active === el) bus.active = null
            if (bus.els.size === 0) buses.delete(syncKey)
        }
    }, [syncKey])

    const onScroll = useCallback(() => {
        const el = scrollRef.current
        if (!el) return
        if (isApplying.current) return

        const bus = getBus(syncKey)
        bus.active = el
        bus.pendingLeft = el.scrollLeft

        if (bus.raf != null) return
        bus.raf = requestAnimationFrame(() => {
            bus.raf = null
            const left = bus.pendingLeft
            for (const other of bus.els) {
                if (other === bus.active) continue
                if (other.scrollLeft === left) continue
                isApplying.current = true
                other.scrollLeft = left
                isApplying.current = false
            }
        })
    }, [syncKey])

    return (
        <div ref={scrollRef} className={className} style={outerStyle} onScroll={onScroll}>
            <div style={gridStyle}>{children}</div>
        </div>
    )
}
