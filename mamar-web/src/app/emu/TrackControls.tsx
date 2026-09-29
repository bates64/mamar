import { ToggleButton, Tooltip, TooltipTrigger, View } from "@adobe/react-spectrum"
import { useEffect, useState } from "react"
import { VolumeX, Headphones } from "react-feather"

import useSongPlayer from "./SongPlayer"
import styles from "./TrackControls.module.scss"

/** Mutes or solos track `trackIndex`, along with the tracks in `alternateParts` that are alternate parts for it. */
export default function TrackControls({ trackIndex, alternateParts = [] }: { trackIndex: number, alternateParts?: number[] }) {
    const player = useSongPlayer()
    const [isMute, setIsMute] = useState(false)
    const [isSolo, setIsSolo] = useState(false)
    const alternatePartsKey = alternateParts.join()

    useEffect(() => {
        const mute = isMute ? "mute" : (isSolo ? "solo" : "none")
        player.setTrackMute(trackIndex, mute)
        for (const slot of alternatePartsKey ? alternatePartsKey.split(",").map(Number) : []) {
            player.setTrackMute(slot, mute)
        }
    }, [player, isMute, isSolo, trackIndex, alternatePartsKey])

    return <View colorVersion={6} UNSAFE_className={styles.controls}>
        <TooltipTrigger>
            <ToggleButton
                UNSAFE_className={styles.mute}
                aria-label="Toggle mute"
                isSelected={isMute}
                onChange={setIsMute}
            >
                <VolumeX size={16} />
            </ToggleButton>
            <Tooltip>Toggle mute</Tooltip>
        </TooltipTrigger>
        <TooltipTrigger>
            <ToggleButton
                UNSAFE_className={styles.solo}
                aria-label="Toggle solo"
                isSelected={isSolo}
                onChange={solo => {
                    if (solo && isMute) {
                        setIsMute(false)
                    }

                    setIsSolo(solo)
                }}
            >
                <Headphones size={16} />
            </ToggleButton>
            <Tooltip>Toggle solo (if a track is soloed, only it will play)</Tooltip>
        </TooltipTrigger>
    </View>
}
