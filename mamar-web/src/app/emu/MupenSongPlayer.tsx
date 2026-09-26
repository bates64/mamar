import { EmulatorControls } from "mupen64plus-web"
import * as patches from "patches"
import { MutableRefObject, ReactNode, useMemo } from "react"

import { SongPlayer, SongPlayerContext, TrackMute } from "./SongPlayer"

import DramView from "../util/DramView"
import useMupen, { ViFn } from "../util/hooks/useMupen"

const TRACK_MUTE_VALUES: Record<TrackMute, number> = {
    none: 0,
    mute: 1,
    solo: 2,
}

function writePatches(emu: EmulatorControls) {
    const dram = new DramView(emu)

    dram.writeU32(patches.RAM_state_step_logos, patches.ASM_PATCH_state_step_logos)
    dram.writeU32(patches.RAM_PATCH_state_step_logos, patches.ASM_PATCH_state_step_logos)

    dram.writeU32(patches.RAM_state_step_title_screen, patches.ASM_PATCH_state_step_title_screen)
    dram.writeU32(patches.RAM_PATCH_state_step_title_screen, patches.ASM_PATCH_state_step_title_screen)

    dram.writeU32(patches.RAM_appendGfx_title_screen, patches.ASM_PATCH_appendGfx_title_screen)
    dram.writeU32(patches.RAM_PATCH_appendGfx_title_screen, patches.ASM_PATCH_appendGfx_title_screen)

    dram.writeU32(patches.RAM_au_load_song_files, patches.ASM_PATCH_au_load_song_files)
    dram.writeU32(patches.RAM_PATCH_au_load_song_files, patches.ASM_PATCH_au_load_song_files)

    dram.writeU32(patches.RAM_MAMAR_au_load_song_files, patches.ASM_MAMAR_au_load_song_files)
}

/** Plays songs by patching the vanilla game running in mupen64plus-web. */
function createMupenSongPlayer(emu: EmulatorControls, viRef: MutableRefObject<ViFn[]>): SongPlayer {
    // The patches reload the song when its ID changes, so alternate between two.
    let tickTock = false

    return {
        load(bgm, variation) {
            if (bgm.length > 0x20000) {
                throw new Error(`Encoded BGM too large, ${bgm.length} > 0x20000 bytes`)
            }

            const dram = new DramView(emu)
            dram.writeU8(patches.RAM_MAMAR_bgm, bgm)
            dram.writeU32(patches.RAM_MAMAR_bgm_size, bgm.length)
            dram.writeU32(patches.RAM_MAMAR_bk_files, new Uint32Array([0, 0, 0]))
            dram.writeU32(patches.RAM_MAMAR_song_id, tickTock ? 0 : 1)
            dram.writeU32(patches.RAM_MAMAR_song_variation, variation)

            tickTock = !tickTock
        },
        async setPaused(paused) {
            if (paused) {
                await emu.pause()
            } else {
                writePatches(emu)
                await emu.resume()
            }
        },
        setAmbientSound(sound) {
            new DramView(emu).writeU32(patches.RAM_MAMAR_ambient_sounds, sound)
        },
        setTrackMute(track, mute) {
            new DramView(emu).writeU32(patches.RAM_MAMAR_trackMute + track * 4, TRACK_MUTE_VALUES[mute])
        },
        onStatus(listener) {
            const vi: ViFn = emu => {
                const tempo = new DramView(emu).readU32(patches.RAM_MAMAR_out_masterTempo) / 100
                listener({ tempo })
            }
            viRef.current.push(vi)
            return () => {
                viRef.current = viRef.current.filter(cb => cb !== vi)
            }
        },
    }
}

export default function MupenSongPlayerProvider({ children }: { children: ReactNode }) {
    const { emu, viRef } = useMupen()
    const player = useMemo(() => createMupenSongPlayer(emu, viRef), [emu, viRef])

    return <SongPlayerContext.Provider value={player}>
        {children}
    </SongPlayerContext.Provider>
}
