import { ActionButton, Flex, ToggleButton, View } from "@adobe/react-spectrum"
import Play from "@spectrum-icons/workflow/Play"
import { useEffect, useState } from "react"

import { useBgm } from "../store"
import useMupen from "../util/hooks/useMupen"
import useRomData from "../util/hooks/useRomData"

import "./PlaybackControls.scss"

export default function PlaybackControls() {
    const [bgm] = useBgm()
    const [isPlaying, setIsPlaying] = useState(false)
    const romData = useRomData()
    const mupen = useMupen(romData)

    useEffect(() => {
        if (!mupen || !bgm) {
            mupen?.pause?.()
            setIsPlaying(false)
            return
        }

        if (isPlaying) {
            mupen.resume()
        } else {
            mupen.pause()
        }

        const onKeydown = (event: KeyboardEvent) => {
            if (event.key === " ") {
                setIsPlaying(!isPlaying)
            }
        }
        document.addEventListener("keydown", onKeydown)
        return () => document.removeEventListener("keydown", onKeydown)
    }, [mupen, bgm, isPlaying])

    if (!bgm) {
        return <View />
    }

    return <Flex alignItems="center">
        <ActionButton
            onPress={() => {
                mupen?.reloadRom(romData)
            }}
        >
            Reload
        </ActionButton>

        <ActionButton
            onPress={() => {
                mupen?.softReset()
            }}
        >
            {"<-" /* TODO: icon */}
        </ActionButton>

        <ToggleButton
            aria-label="Toggle playback"
            UNSAFE_className="PlaybackControls_play"
            isEmphasized
            isSelected={isPlaying}
            onChange={(p: boolean) => {
                setIsPlaying(p)
            }}
        >
            <Play />
        </ToggleButton>
    </Flex>
}
