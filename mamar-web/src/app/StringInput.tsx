import { useEffect, useRef } from "react"

import styles from "./StringInput.module.scss"

export interface Props {
    value: string
    onChange: (value: string) => void
    id?: string
}

export default function StringInput({ value, onChange, id }: Props) {
    const ref = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (ref.current)
            ref.current.style.width = `${value.length + 1}ch`
    }, [ref, value])

    return <input
        ref={ref}
        id={id}
        type="text"
        className={styles.input}
        value={value}
        onChange={evt => {
            const value = evt.target.value
            onChange(value)
        }}
    />
}
