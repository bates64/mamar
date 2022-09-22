import { DialogContainer, Flex, ToggleButton, View } from "@adobe/react-spectrum"
import Play from "@spectrum-icons/workflow/Play"
import { useEffect, useState } from "react"

import PaperMarioRomInputDialog, { useCachedPaperMarioUsRom } from "./PaperMarioRomInputDialog"

import { useBgm } from "../store"
import useMupen from "../util/hooks/useMupen"

import "./PlaybackControls.scss"

export default function PlaybackControls() {
    const [bgm] = useBgm()
    const [isPlaying, setIsPlaying] = useState(false)
    const [romData, setRomData] = useState(useCachedPaperMarioUsRom())
    const [showDialog, setShowDialog] = useState(false)
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
        <ToggleButton
            aria-label="Toggle playback"
            UNSAFE_className="PlaybackControls_play"
            isEmphasized
            isSelected={isPlaying}
            onChange={(p: boolean) => {
                if (romData) {
                    setIsPlaying(p)
                } else {
                    setShowDialog(true)
                }
            }}
        >
            <Play />
        </ToggleButton>

        <DialogContainer onDismiss={() => setShowDialog(false)}>
            {showDialog && <PaperMarioRomInputDialog onChange={setRomData} />}
        </DialogContainer>
    </Flex>
}
