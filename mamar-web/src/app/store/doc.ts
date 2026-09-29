import { Bgm } from "pm64-typegen"

import { BgmAction, bgmReducer } from "./bgm"
import { useRoot } from "./dispatch"

export type PanelContent = {
    type: "not_open"
} | {
    type: "tracker"
    trackList: number
    track: number
    segment: number
}

/** How loudly a proximity mix plays: outside its area, inside it, or as loud as the game's scripts can make it. */
export type MixLevel = "off" | "near" | "full"

/** Where in the game the song is heard, which decides the parts it plays. */
export interface Location {
    /** The proximity mix, which chooses the option each branch plays. */
    mix: number
    level: MixLevel
    /** Whether alternate parts play instead of the tracks they're for. */
    alternateParts: boolean
}

export const DEFAULT_LOCATION: Location = { mix: 0, level: "off", alternateParts: false }

/** Volume of each level, as snd_song_set_proximity_mix_far, _near, and _full set it. */
const MIX_LEVEL_VOLUMES: Record<MixLevel, number> = { off: 0, near: 87, full: 127 }

/** The value au_bgm_set_proximity_mix takes for `location`: the mix in bits 0-7, and its volume in bits 24-30. */
export function proximityMixValue({ mix, level }: Location): number {
    return ((MIX_LEVEL_VOLUMES[level] << 24) | (mix & 0xFF)) >>> 0
}

/** The grid that points placed on the timeline snap to. */
export type Snap = "bar" | "beat" | "eighth" | "sixteenth" | "off"

export const DEFAULT_SNAP: Snap = "eighth"

/** Commands selected in one track. */
export interface Selection {
    trackList: number
    track: number
    /** The events' IDs, in the track's commands with detours written out. */
    events: number[]
}

export interface Doc {
    id: string
    bgm: Bgm
    fileHandle?: FileSystemFileHandle
    name: string
    isSaved: boolean
    activeVariation: number
    panelContent: PanelContent
    location: Location
    snap: Snap
    selection?: Selection | null
    /** Song lanes chosen to be shown or hidden, by key. Others are shown if they have commands. */
    shownLanes?: Record<string, boolean>
    /** The key of the lane chosen for each track under the piano roll, by track index. */
    trackLanes?: Record<number, string>
    /** Ticks per pixel along the timeline. */
    zoom?: number
    /** The part of the active variation that playback repeats, if one has been marked. */
    cycle?: Cycle | null
}

/** A part of the timeline that playback can repeat, as in a DAW. */
export interface Cycle {
    /** Where it starts and ends, in ticks along the timeline. */
    start: number
    end: number
    /** Whether playback repeats it. */
    isEnabled: boolean
}

export const DEFAULT_ZOOM = 2
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 16

export type DocAction = {
    type: "bgm"
    action: BgmAction
} | {
    type: "mark_saved"
    fileHandle?: FileSystemFileHandle | null
} | {
    type: "set_panel_content"
    panelContent: PanelContent
} | {
    type: "set_variation"
    index: number
} | {
    type: "set_location"
    location: Partial<Location>
} | {
    type: "set_snap"
    snap: Snap
} | {
    type: "set_selection"
    selection: Selection | null
} | {
    type: "set_zoom"
    zoom: number
} | {
    type: "set_lane_shown"
    lane: string
    shown: boolean
} | {
    type: "set_track_lane"
    track: number
    lane: string
} | {
    type: "set_cycle"
    cycle: Cycle | null
}

export function docReducer(state: Doc, action: DocAction): Doc {
    switch (action.type) {
    case "bgm":
        return {
            ...state,
            bgm: bgmReducer(state.bgm, action.action),
            isSaved: false,
        }
    case "mark_saved":
        return {
            ...state,
            isSaved: true,
            fileHandle: action.fileHandle ?? state.fileHandle,
            name: action.fileHandle?.name ?? state.name,
        }
    case "set_panel_content":
        return {
            ...state,
            panelContent: action.panelContent,
        }
    case "set_variation":
        return {
            ...state,
            activeVariation: action.index,
            // A cycle marks a part of one variation's timeline
            cycle: null,
        }
    case "set_zoom":
        return {
            ...state,
            zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, action.zoom)),
        }
    case "set_lane_shown":
        return {
            ...state,
            shownLanes: { ...state.shownLanes, [action.lane]: action.shown },
        }
    case "set_selection":
        return {
            ...state,
            selection: action.selection,
        }
    case "set_snap":
        return {
            ...state,
            snap: action.snap,
        }
    case "set_track_lane":
        return {
            ...state,
            trackLanes: { ...state.trackLanes, [action.track]: action.lane },
        }
    case "set_cycle":
        return {
            ...state,
            cycle: action.cycle,
        }
    case "set_location":
        return {
            ...state,
            location: { ...(state.location ?? DEFAULT_LOCATION), ...action.location },
        }
    }
}

/** IDs of the selected events in track `trackIndex` of track list `trackListId`. */
export const useSelectedIds = (trackListId: number, trackIndex: number): number[] => {
    const [doc] = useDoc()
    const selection = doc?.selection
    return selection?.trackList === trackListId && selection.track === trackIndex ? selection.events : []
}

export const useLocation = (): [Location, (location: Partial<Location>) => void] => {
    const [doc, dispatch] = useDoc()
    return [doc?.location ?? DEFAULT_LOCATION, location => dispatch({ type: "set_location", location })]
}

export const useDoc = (id?: string): [Doc | undefined, (action: DocAction) => void] => {
    const [root, dispatch] = useRoot()
    const trueId = id ?? root.activeDocId
    const doc = trueId ? root.docs[trueId] : undefined
    const docDispatch = (action: DocAction) => {
        if (trueId) {
            dispatch({ type: "doc", id: trueId, action })
        }
    }
    return [doc, docDispatch]
}
