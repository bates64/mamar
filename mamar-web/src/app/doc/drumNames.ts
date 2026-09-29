import { useMemo } from "react"

import { HIGHEST_PITCH, LOWEST_PITCH } from "./pitches"

import * as instruments from "../instruments"
import { useBgm } from "../store"
import { useOptionalSoundBank } from "../util/hooks/useSoundBank"
import { kitDrums } from "../util/soundBank"

/** How many drums the shared kit has, after which pitches play the song's own drums. */
const KIT_SIZE = 72

/**
 * A drum's name, without the kit it's from, which the names start with, such as "STANDARD 1", or which some repeat, such
 * as "TR-808 TR-808 Kick 1".
 */
function shortName(name: string): string {
    return name.replace(/^[A-Z0-9 ]+ (?=[A-Z][a-z])/, "").replace(/^(\S+) (?=\1 )/, "")
}

/**
 * The name of the drum each pitch plays on a percussion track: the shared kit's drums first, then the song's own. Names
 * are undefined for pitches that play no drum.
 */
export function useDrumNames(): (pitch: number) => string | undefined {
    const sbn = useOptionalSoundBank()
    const [bgm] = useBgm()
    const kit = useMemo(() => (sbn ? kitDrums(sbn) : []), [sbn])

    return pitch => {
        if (pitch < LOWEST_PITCH || pitch > HIGHEST_PITCH) {
            return undefined
        }
        const index = pitch - LOWEST_PITCH
        const patch = index < KIT_SIZE ? kit[index] : bgm?.drums[index - KIT_SIZE]?.patch
        return patch && shortName(instruments.getName(patch))
    }
}
