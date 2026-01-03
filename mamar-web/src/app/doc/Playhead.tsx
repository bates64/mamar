import { useEffect, useRef, useState, useContext, createContext } from "react"

import styles from "./Playhead.module.scss"
import { useTime } from "./TimeProvider"

import { useDoc } from "../store"

interface Context {
    position: number // Playhead position in ticks
    setPosition: (ticks: number) => void
}

export const CONTEXT = createContext<Context | null>(null)

export function PlayheadContextProvider({ children }: { children: React.ReactNode }) {
    const [position, setPosition] = useState(0)
    const [doc] = useDoc()

    // If the variation changes, reset the position
    useEffect(() => {
        setPosition(0)
    }, [doc?.id, doc?.activeVariation])

    return (
        <CONTEXT.Provider value={{ position, setPosition }}>
            {children}
        </CONTEXT.Provider>
    )
}

function snapToBeat(ticks: number): number {
    return Math.round(ticks / 48) * 48
}

export default function Playhead() {
    const { xToTicks, ticksToXOffset } = useTime()
    const [dragPosition, setDragPosition] = useState(0)
    const context = useContext(CONTEXT)!
    const dragging = useRef(false)

    const [doc] = useDoc()

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
            dragging.current = false
            document.body.style.cursor = ""
            context.setPosition(dragPosition)
        }

        window.addEventListener("mousemove", onMouseMove)
        window.addEventListener("mouseup", onMouseUp)
        return () => {
            window.removeEventListener("mousemove", onMouseMove)
            window.removeEventListener("mouseup", onMouseUp)
        }
    }, [xToTicks, dragPosition, context])

    if (!doc) return null

    return <div
        className={styles.container}
    >
        <div
            className={styles.head}
            style={{ left: ticksToXOffset(dragging.current ? dragPosition : context.position) + "px" }}
            onMouseDown={e => {
                dragging.current = true
                setDragPosition(context.position)
                document.body.style.cursor = "grab"
                e.stopPropagation()
            }}
            title="Drag to adjust start time"
        >

        </div>
    </div>
}
