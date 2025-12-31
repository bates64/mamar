import { createContext, useContext, useRef } from "react"

import { useSegmentLengths } from "./Ruler"

export interface Time {
    xToTicks(clientX: number): number
    ticksToXOffset(ticks: number): number
}

const TIME_CTX = createContext<Time | null>(null)

export function useTime(): Time {
    const time = useContext(TIME_CTX)

    if (!time) {
        return {
            xToTicks(_: number): number {
                throw new Error("TimeProvider missing in tree")
            },
            ticksToXOffset(_: number): number {
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

    return <TIME_CTX.Provider value={{
        xToTicks(clientX: number): number {
            if (!container.current) return NaN
            const px = clientX - container.current.getBoundingClientRect().left
            const style = getComputedStyle(container.current)
            const rulerZoom = parseFloat(style.getPropertyValue("--ruler-zoom"))

            const ticks = (px - 225) * rulerZoom
            if (ticks < 0) return 0
            if (ticks > totalLength) return totalLength
            return ticks
        },

        ticksToXOffset(ticks: number): number {
            if (!container.current) return NaN
            const style = getComputedStyle(container.current)
            const rulerZoom = parseFloat(style.getPropertyValue("--ruler-zoom"))
            return ticks / rulerZoom
        },
    }}>
        <div ref={container} style={{ "--ruler-zoom": 2 } as any}>
            {children}
        </div>
    </TIME_CTX.Provider>
}
