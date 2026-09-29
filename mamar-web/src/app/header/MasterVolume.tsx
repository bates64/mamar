import { Slider } from "@adobe/react-spectrum"
import { useEffect, useState } from "react"
import { Volume, Volume1, Volume2, VolumeX } from "react-feather"

import styles from "./MasterVolume.module.scss"

import useSongPlayer from "../emu/SongPlayer"

const STORAGE_KEY = "mamar_volume"

function savedVolume(): number {
    try {
        const saved = localStorage.getItem(STORAGE_KEY)
        const volume = Number(saved)
        return saved !== null && volume >= 0 && volume <= 1 ? volume : 1
    } catch {
        return 1
    }
}

/** How loud everything plays, which this browser remembers. */
export default function MasterVolume() {
    const player = useSongPlayer()
    const [volume, setVolume] = useState(savedVolume)

    useEffect(() => {
        // Loudness is heard roughly as the square of amplitude, so the slider's middle sounds about half as loud
        player.setVolume(volume * volume)
        try {
            localStorage.setItem(STORAGE_KEY, String(volume))
        } catch {
            // The volume still applies, just not after reloading
        }
    }, [player, volume])

    const Icon = volume === 0 ? VolumeX : volume < 0.33 ? Volume : volume < 0.66 ? Volume1 : Volume2

    return <div className={styles.volume}>
        <Icon size={18} aria-hidden />
        <Slider
            aria-label="Master volume"
            minValue={0}
            maxValue={1}
            step={0.01}
            value={volume}
            onChange={setVolume}
            formatOptions={{ style: "percent" }}
            width="size-1600"
            isFilled
        />
    </div>
}
