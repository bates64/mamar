import { ToggleButton, Tooltip, TooltipTrigger, View } from "@adobe/react-spectrum"
import { RAM_MAMAR_trackMute } from "patches"
import { useEffect, useState } from "react"
import { VolumeX, Headphones } from "react-feather"

import styles from "./TrackControls.module.scss"

import DramView from "../util/DramView"
import useMupen from "../util/hooks/useMupen"

export default function TrackControls({ trackIndex }: { trackIndex: number }) {
    const { emu } = useMupen()
    const [isMute, setIsMute] = useState(false)
    const [isSolo, setIsSolo] = useState(false)

    useEffect(() => {
        const dram = new DramView(emu)
        dram.writeU32(RAM_MAMAR_trackMute + trackIndex * 4, isMute ? 1 : (isSolo ? 2 : 0))
    }, [emu, isMute, isSolo, trackIndex])

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
