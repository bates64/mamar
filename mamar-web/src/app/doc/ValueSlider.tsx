import { Slider } from "@adobe/react-spectrum"
import { useState } from "react"

/**
 * A slider for a value of a song, which shows `value` as `format` gives it. It changes the song once the drag ends, so a
 * drag is one change to undo.
 */
export default function ValueSlider({ label, value, min, max, format, fillOffset, onChange }: {
    label: string
    value: number
    min: number
    max: number
    format?(value: number): string
    /** Where the fill starts from, such as the center for pan. */
    fillOffset?: number
    onChange(value: number): void
}) {
    const [dragging, setDragging] = useState<number | null>(null)

    return <Slider
        label={label}
        width="100%"
        minValue={min}
        maxValue={max}
        value={dragging ?? value}
        getValueLabel={value => (format ?? String)(value)}
        isFilled
        fillOffset={fillOffset}
        onChange={setDragging}
        onChangeEnd={value => {
            setDragging(null)
            onChange(value)
        }}
    />
}
