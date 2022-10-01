import { useEffect, useRef, useState } from "react"

import styles from "./VerticalDragNumberInput.module.scss"

export interface Props {
    value: number
    minValue: number
    maxValue: number
    onChange: (value: number) => void
}

export default function VerticalDragNumberInput({ value, minValue, maxValue, onChange }: Props) {
    const [snapshot, setSnapshot] = useState(value)
    const [startVal, setStartVal] = useState(0)

    const valueRef = useRef(value)
    valueRef.current = value

    useEffect(() => {
        const onUpdate = (evt: MouseEvent) => {
            if (startVal) {
                const delta = Math.floor((evt.clientY - startVal) / 25) * -1

                const newValue = snapshot + delta
                if (newValue >= minValue && newValue <= maxValue && newValue !== valueRef.current) {
                    onChange(newValue)
                }
            }
        }

        const onEnd = () => {
            setStartVal(0)
        }

        document.addEventListener("mousemove", onUpdate)
        document.addEventListener("mouseup", onEnd)
        return () => {
            document.removeEventListener("mousemove", onUpdate)
            document.removeEventListener("mouseup", onEnd)
        }
    }, [startVal, onChange, snapshot, minValue, maxValue])

    return <input
        type="number"
        className={styles.input}
        value={value}
        min={minValue}
        max={maxValue}
        onChange={evt => {
            const value = parseInt(evt.target.value)
            if (value >= minValue && value <= maxValue) {
                onChange(value)
            }
        }}
        onMouseDown={evt => {
            setStartVal(evt.clientY)
            setSnapshot(value)

            evt.preventDefault()
            evt.stopPropagation()
        }}
    />
}
