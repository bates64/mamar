import useResizeObserver from "@react-hook/resize-observer"
import { useState, useRef, useLayoutEffect, RefObject } from "react"

export function useSize<T extends HTMLElement>(): {
    width: number | undefined
    height: number | undefined
    ref: RefObject<T>
    } {
    const ref = useRef<T>(null)
    const [size, setSize] = useState<{ width?: number, height?: number }>({ width: undefined, height: undefined })

    useLayoutEffect(() => {
        if (ref.current)
            setSize(ref.current.getBoundingClientRect())
    }, [ref])

    useResizeObserver(ref, entry => setSize(entry.contentRect))

    return { width: size.width, height: size.height, ref }
}
