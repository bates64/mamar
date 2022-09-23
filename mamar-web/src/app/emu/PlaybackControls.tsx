import { ActionButton, Flex, ToggleButton, View } from "@adobe/react-spectrum"
import Play from "@spectrum-icons/workflow/Play"
import * as patches from "patches"
import { Bgm } from "pm64-typegen"
import { useEffect, useMemo, useState } from "react"

import { useBgm } from "../store"
import useMupen from "../util/hooks/useMupen"
import useRomData from "../util/hooks/useRomData"
import Patcher from "../util/Patcher"

import "./PlaybackControls.scss"

function usePatchedRom(bgm: Bgm | undefined): ArrayBuffer | undefined {
    const cleanRom = useRomData()

    return useMemo(() => {
        if (!bgm) {
            return undefined
        }

        const rom = cleanRom.slice(0)
        //const patcher = new Patcher(rom)
        //patcher.overwriteFunction(0xF4A4, patches.skipIntroLogos)
        //patcher.overwriteFunction(0x10, [0x1B99678D, 0xE109577C])

        // TODO: encode bgm, write over Toad Town in SBN

        return rom
    }, [cleanRom, bgm])
}

export default function PlaybackControls() {
    const [bgm] = useBgm()
    const [isPlaying, setIsPlaying] = useState(false)
    const romData = usePatchedRom(isPlaying ? bgm : undefined)
    const mupen = useMupen(romData)

    useEffect(() => {
        if (isPlaying) {
            mupen?.resume?.()
        } else {
            mupen?.pause?.()
        }

        const onKeydown = (event: KeyboardEvent) => {
            if (event.key === " ") {
                setIsPlaying(!isPlaying)
            }
        }
        document.addEventListener("keydown", onKeydown)
        return () => document.removeEventListener("keydown", onKeydown)
    }, [mupen, isPlaying])

    if (!bgm) {
        return <View />
    }

    return <Flex alignItems="center">
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
