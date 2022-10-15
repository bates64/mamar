import { useEffect, useRef, useState } from "react"

import styles from "./NoteInput.module.scss"

const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

function pitchToNoteName(pitch: number) {
    pitch = pitch - 104
    const octave = Math.floor(pitch / 12)
    const note = notes[pitch % 12]
    return `${note}${octave}`
}

function noteNameToPitch(noteName: string) {
    const re = /([A-G])(#|b)?(\d+)/
    const match = noteName.match(re)
    if (!match) {
        throw new Error(`Invalid note name: ${noteName}`)
    }
    const [, note, sharp, octave] = match
    let noteIndex = notes.indexOf(note + (sharp === "#" ? "#" : ""))
    if (sharp === "b") {
        noteIndex--
    }
    if (noteIndex >= 0) {
        return noteIndex + parseInt(octave) * 12 + 104
    } else {
        throw new Error(`Invalid note name: ${noteName}`)
    }
}

export interface Props {
    pitch: number
    onChange(pitch: number): void
}

export default function NoteInput({ pitch, onChange }: Props) {
    const ref = useRef<HTMLInputElement>(null)
    const [value, setValue] = useState(pitchToNoteName(pitch))

    useEffect(() => {
        setValue(pitchToNoteName(pitch))
    }, [pitch])

    useEffect(() => {
        if (ref.current)
            ref.current.style.width = `${value.toString().length + 1}ch`
    }, [ref, value])

    return <input
        ref={ref}
        className={styles.input}
        type="text"
        value={value}
        onChange={evt => setValue(evt.target.value)}
        onBlur={evt => {
            try {
                const newPitch = noteNameToPitch(evt.target.value)
                if (newPitch >= 0 && newPitch <= 255) {
                    onChange(newPitch)
                } else {
                    setValue(pitchToNoteName(pitch))
                }
            } catch (err) {
                console.error(err)
                setValue(pitchToNoteName(pitch))
            }
        }}
    />
}
