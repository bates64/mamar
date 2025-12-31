import { useEffect, useRef, useState } from "react"

import styles from "./Playhead.module.scss"
import { useTime } from "./TimeProvider"

import { useBgm, useDoc } from "../store"

function snapToBeat(ticks: number): number {
    return Math.round(ticks / 48) * 48
}

export default function Playhead() {
    const { xToTicks, ticksToXOffset } = useTime()
    const [ticks, setTicks] = useState(0)
    const dragging = useRef(false)

    const [doc] = useDoc()
    const [, dispatch] = useBgm()

    useEffect(() => {
        function onMouseMove(e: MouseEvent) {
            if (!dragging.current) return
            let ticks = xToTicks(e.clientX)
            if (!e.shiftKey) {
                ticks = snapToBeat(ticks)
            }
            setTicks(ticks)
        }

        function onMouseUp() {
            dragging.current = false
            document.body.style.cursor = ""
        }

        window.addEventListener("mousemove", onMouseMove)
        window.addEventListener("mouseup", onMouseUp)
        return () => {
            window.removeEventListener("mousemove", onMouseMove)
            window.removeEventListener("mouseup", onMouseUp)
        }
    }, [xToTicks])

    if (!doc) return null

    return <div
        className={styles.container}
    >
        <div
            className={styles.head}
            style={{ left: ticksToXOffset(ticks) + "px" }}
            onMouseDown={() => {
                dragging.current = true
                document.body.style.cursor = "grab"
            }}
            onClick={e => {
                // TODO: move to a button elsewhere
                dispatch({
                    type: "split_variation",
                    variation: doc.activeVariation,
                    time: ticks,
                })
                e.stopPropagation()
            }}
        >

        </div>
    </div>
}
