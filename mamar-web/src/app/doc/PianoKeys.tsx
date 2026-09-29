import classNames from "classnames"
import { RefObject, useEffect, useRef } from "react"

import { useDrumNames } from "./drumNames"
import styles from "./PianoKeys.module.scss"
import { HIGHEST_PITCH, LOWEST_PITCH, NOTE_HEIGHT, pitchName } from "./pitches"

const BLACK_KEYS = [1, 3, 6, 8, 10]

/**
 * Keeps `ref`, which is beside the selected segment's piano roll, scrolled to the pitches the roll shows, and as tall as
 * the roll, which the lane under it leaves.
 */
export function useFollowPianoRoll(ref: RefObject<HTMLElement>, region: string) {
    useEffect(() => {
        const el = ref.current
        const roll = el?.closest(`.${region}`)?.querySelector<HTMLElement>("[data-selected-roll]")
        if (!el || !roll) return

        const follow = () => {
            el.style.height = `${roll.clientHeight}px`
            el.scrollTop = roll.scrollTop
        }
        const resize = new ResizeObserver(follow)
        resize.observe(roll)
        roll.addEventListener("scroll", follow)
        follow()
        return () => {
            resize.disconnect()
            roll.removeEventListener("scroll", follow)
        }
    }, [ref, region])
}

/**
 * A piano keyboard beside the piano roll, a key for each of its rows, which scrolls up and down with it but not across.
 * Each C is labelled. A percussion track's rows are drums rather than keys, named when hovered.
 */
export default function PianoKeys({ region, isDrumTrack, pitchLimit }: {
    region: string
    isDrumTrack: boolean
    /** The highest pitch the track's instrument plays at its own pitch, above which keys are red, if it has a limit. */
    pitchLimit?: number
}) {
    const keys = useRef<HTMLDivElement>(null)
    const drumName = useDrumNames()
    useFollowPianoRoll(keys, region)

    const rows = []
    for (let pitch = HIGHEST_PITCH; pitch >= LOWEST_PITCH; pitch--) {
        const degree = (pitch - LOWEST_PITCH) % 12
        const name = isDrumTrack ? drumName(pitch) : pitchName(pitch)
        rows.push(<div
            key={pitch}
            className={classNames(styles.key, isDrumTrack ? {
                [styles.drum]: true,
                [styles.alternate]: pitch % 2 === 1,
                [styles.unplayable]: !name,
            } : {
                [styles.black]: BLACK_KEYS.includes(degree),
                // C and F have no black key below them, so a line separates them from the white key below
                [styles.gap]: degree === 0 || degree === 5,
                [styles.limited]: pitchLimit !== undefined && pitch > pitchLimit,
            })}
            style={{ height: NOTE_HEIGHT }}
            title={pitchLimit !== undefined && pitch > pitchLimit ? `${name}: too high for this instrument` : name}
        >
            {!isDrumTrack && degree === 0 && <span className={styles.label}>{name}</span>}
        </div>)
    }

    return <div className={styles.column}>
        <div ref={keys} className={styles.keys} aria-hidden="true">
            {rows}
        </div>
    </div>
}

/**
 * The names of the drums a percussion track's rows play, at the left of the piano roll as it scrolls. They're too long
 * for the keyboard beside it. Clicks pass through them to the notes.
 */
export function DrumLabels({ region }: { region: string }) {
    const labels = useRef<HTMLDivElement>(null)
    const drumName = useDrumNames()
    useFollowPianoRoll(labels, region)

    const rows = []
    for (let pitch = HIGHEST_PITCH; pitch >= LOWEST_PITCH; pitch--) {
        const name = drumName(pitch)
        if (name) {
            rows.push(<div key={pitch} className={styles.drumLabel} style={{ top: (HIGHEST_PITCH - pitch) * NOTE_HEIGHT, height: NOTE_HEIGHT }}>
                {name}
            </div>)
        }
    }

    return <div className={styles.drumLabels} aria-hidden="true">
        <div ref={labels} className={styles.drumLabelsScroll}>
            <div style={{ position: "relative", height: (HIGHEST_PITCH - LOWEST_PITCH + 1) * NOTE_HEIGHT }}>{rows}</div>
        </div>
    </div>
}
