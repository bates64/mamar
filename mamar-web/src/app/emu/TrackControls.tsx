import { ToggleButton, Tooltip, TooltipTrigger, View } from "@adobe/react-spectrum"
import { useEffect, useState } from "react"
import { VolumeX, Headphones } from "react-feather"

import useSongPlayer from "./SongPlayer"
import styles from "./TrackControls.module.scss"

export default function TrackControls({ trackIndex }: { trackIndex: number }) {
    const player = useSongPlayer()
    const [isMute, setIsMute] = useState(false)
    const [isSolo, setIsSolo] = useState(false)

    useEffect(() => {
        player.setTrackMute(trackIndex, isMute ? "mute" : (isSolo ? "solo" : "none"))
    }, [player, isMute, isSolo, trackIndex])

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
