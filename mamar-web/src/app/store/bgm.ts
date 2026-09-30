import produce, { current, setAutoFreeze } from "immer"
import { Bgm, Command, Event, Instrument, Track, TrackList } from "pm64-typegen"
import { arrayMove } from "react-movable"

import { useDoc } from "./doc"
import { VariationAction, variationReducer } from "./variation"

import Bridge from "../bridge"

// Freezing react-tracked proxies can cause proxy invariant errors
setAutoFreeze(false)

export type BgmAction = {
    type: "variation"
    index: number
    action: VariationAction
} | {
    type: "add_voice"
} | {
    /** Moves a command of a track, as the blocks view lists them, with detours written out. */
    type: "move_track_command"
    trackList: number
    track: number
    oldIndex: number
    newIndex: number
} | {
    type: "update_track_command"
    trackList: number
    track: number
    command: Event
} | {
    type: "modify_track_settings"
    trackList: number
    track: number
    name?: string
    isDisabled?: boolean
    isDrumTrack?: boolean
} | {
    type: "update_instrument"
    index: number
    partial: Partial<Instrument>
} | {
    type: "add_instrument"
    instrument: Instrument
    /** The command, in track `track` of track list `trackList`, that chooses the new instrument. */
    trackList: number
    track: number
    event: Event
} | {
    type: "split_variation"
    variation: number
    time: number
} | {
    type: "set_beats_per_bar"
    beatsPerBar: number
} | {
    type: "insert_track_command"
    trackList: number
    track: number
    time: number
    command: Command
} | {
    type: "place_track_command"
    trackList: number
    track: number
    /** The event's ID, in the track's commands with detours written out. */
    id: number
    time: number
    command: Command
} | {
    type: "place_track_commands"
    trackList: number
    track: number
    /** Each event's ID, in the track's commands with detours written out, and where it goes. */
    places: { id: number, time: number, command: Command }[]
} | {
    type: "insert_track_commands"
    trackList: number
    track: number
    inserts: { time: number, command: Command }[]
} | {
    type: "delete_track_commands"
    trackList: number
    track: number
    /** The events' IDs, in the track's commands with detours written out. */
    ids: number[]
} | {
    type: "set_segment_length"
    trackList: number
    length: number
} | {
    type: "vary_by_mix"
    trackLists: number[]
    track: number
    /** Ticks between the times the track can change to another mix's passage. */
    interval: number
} | {
    type: "stop_varying_by_mix"
    trackLists: number[]
    track: number
} | {
    type: "add_mix"
} | {
    type: "remove_mix"
    mix: number
} | {
    type: "set_mix_name"
    mix: number
    name: string
}

/**
 * The names of a track and its alternate part, which plays instead of it when the game turns alternate parts on. Only
 * Dry Dry Desert has alternate parts, which play in the oasis.
 */
export const MAIN_PART_NAME = "Desert"
export const ALTERNATE_PART_NAME = "Oasis"

/** The index of the track that is an alternate part for track `index` of `trackList`, if there is one. */
export function alternatePartOf(trackList: TrackList, index: number): number | undefined {
    const alternate = trackList.tracks.findIndex(track => !track.is_disabled && track.alternate_for === index)
    return alternate >= 0 ? alternate : undefined
}

/** The index of the track that plays as track `index` of `trackList`: its alternate part, if alternate parts are on. */
export function playingTrack(trackList: TrackList, index: number, alternateParts: boolean): number {
    return (alternateParts ? alternatePartOf(trackList, index) : undefined) ?? index
}

/** What the song calls proximity mix `mix`. */
export function mixName(bgm: Bgm, mix: number): string {
    return bgm.mix_names?.[mix] ?? `Mix ${mix}`
}

/** How many proximity mixes the song's branches choose between. */
export function mixCount(bgm: Bgm): number {
    return Math.max(0, ...Object.values(bgm.branches ?? {}).map(branch => branch.options.length))
}

/**
 * Whether `track` plays drums in proximity mix `mix`. A track that varies by mix plays drums or not in each mix's
 * passages, as each of its first branch's options says.
 */
export function playsDrums(bgm: Bgm, track: Track, mix: number): boolean {
    const first = track.commands.find(event => "Branch" in event)
    const options = first && "Branch" in first ? bgm.branches[first.Branch.branch]?.options : undefined
    return (options?.[mix] ?? options?.[0])?.is_drum_track ?? track.is_drum_track
}

/** Whether `commands` play a passage of their own in each proximity mix. */
export function variesByMix(commands: Event[]): boolean {
    // A detour only plays commands the sequence has, so a branch it plays is one of them
    return commands.some(event => "Branch" in event)
}

/**
 * The branches of `branches` that `commands` play, which is all that working out what they play needs. Passing only
 * these to the bridge saves reading every other branch in the song.
 */
export function branchesPlayedBy(commands: Event[], branches: Bgm["branches"]): Bgm["branches"] {
    const played: Bgm["branches"] = {}
    for (const event of commands) {
        if ("Branch" in event && branches[event.Branch.branch]) {
            played[event.Branch.branch] = branches[event.Branch.branch]
        }
    }
    return played
}

/** `bgm` without the branches no track plays. */
function withoutUnplayedBranches(bgm: Bgm): Bgm {
    const played = new Set<number>()
    for (const trackList of Object.values(bgm.track_lists)) {
        for (const track of trackList.tracks) {
            for (const event of track.commands) {
                if ("Branch" in event) {
                    played.add(event.Branch.branch)
                }
            }
        }
    }
    return { ...bgm, branches: Object.fromEntries(Object.entries(bgm.branches).filter(([id]) => played.has(Number(id)))) }
}

/** `bgm` with track `index` of track list `trackListId` changed by `change`, which is given its track. */
function withTrack(bgm: Bgm, trackListId: number, index: number, change: (track: Track) => Track): Bgm {
    const trackList = bgm.track_lists[trackListId]
    const tracks = [...trackList.tracks] as TrackList["tracks"]
    tracks[index] = change(tracks[index])
    return { ...bgm, track_lists: { ...bgm.track_lists, [trackListId]: { ...trackList, tracks } } }
}

/**
 * Whether the events with IDs `ids` are all the track's own commands, rather than ones in the passages of its mixes, as
 * the blocks view edits them, branches and all.
 */
function isOwnCommand(bgm: Bgm, { trackList, track }: { trackList: number, track: number }, ids: number[]): boolean {
    const commands = Bridge.commands_without_detours(bgm.track_lists[trackList].tracks[track].commands) as Event[]
    return ids.every(id => commands.some(event => event.id === id))
}

/**
 * `bgm` with the commands of track `index` of track list `trackListId` edited by `edit`, which is given them as they
 * play in proximity mix `mix`, with detours written out, as the editor shows them. A track that varies by mix has
 * the edit written back into that mix's passages, unless `mix` is undefined, which edits the track's own commands and
 * its branches. The track forgets where it was decoded from, so the encoder compresses it into detours again.
 */
function editTrack(bgm: Bgm, trackListId: number, index: number, mix: number | undefined, edit: (commands: Event[]) => Event[]): Bgm {
    const track = bgm.track_lists[trackListId].tracks[index]
    if (mix === undefined || !variesByMix(track.commands)) {
        return withTrack(bgm, trackListId, index, ({ pos: _, ...track }) => ({
            ...track,
            commands: edit(Bridge.commands_without_detours(track.commands)),
        }))
    }
    const played = edit(Bridge.commands_for_mix(track.commands, branchesPlayedBy(track.commands, bgm.branches), mix))
    const { commands, branches } = Bridge.commands_set_for_mix(track.commands, bgm.branches, mix, played)
    return withoutUnplayedBranches(withTrack({ ...bgm, branches }, trackListId, index, ({ pos: _, ...track }) => ({ ...track, commands })))
}

/**
 * Applies `action` to `bgm`. Edits to a track's commands edit them as they play in proximity mix `mix`, the one
 * being listened to.
 */
export function bgmReducer(bgm: Bgm, action: BgmAction, mix = 0): Bgm {
    switch (action.type) {
    case "variation": {
        const applyVariation = (index: number) => {
            const variation = bgm.variations[index]
            if (index === action.index && variation) {
                return variationReducer(variation, action.action)
            } else {
                return variation
            }
        }
        return {
            ...bgm,
            variations: [
                applyVariation(0),
                applyVariation(1),
                applyVariation(2),
                applyVariation(3),
            ],
        }
    } case "add_voice":
        return Bridge.bgm_add_voice(bgm)
    case "update_track_command":
        return editTrack(bgm, action.trackList, action.track, isOwnCommand(bgm, action, [action.command.id]) ? undefined : mix, commands =>
            commands.map(event => (event.id === action.command.id ? action.command : event)))
    case "move_track_command":
        return editTrack(bgm, action.trackList, action.track, undefined, commands =>
            arrayMove(commands, action.oldIndex, action.newIndex))
    case "modify_track_settings": {
        const track = bgm.track_lists[action.trackList].tracks[action.track]
        // A track that varies by mix plays drums or not in each mix's passages
        const isMixPercussion = action.isDrumTrack !== undefined && variesByMix(track.commands)
        return produce(bgm, draft => {
            const track = draft.track_lists[action.trackList].tracks[action.track]
            if (action.name !== undefined) {
                track.name = action.name
            }
            if (action.isDisabled !== undefined) {
                track.is_disabled = action.isDisabled
            }
            if (action.isDrumTrack !== undefined && !isMixPercussion) {
                track.is_drum_track = action.isDrumTrack
            }
            if (isMixPercussion) {
                for (const event of Bridge.commands_without_detours(current(track).commands) as Event[]) {
                    const branch = "Branch" in event ? draft.branches[event.Branch.branch] : undefined
                    if (!branch) continue
                    while (branch.options.length <= mix) {
                        const first = current(branch.options[0])
                        branch.options.push({ is_drum_track: first.is_drum_track, commands: Bridge.commands_copy(first.commands) })
                    }
                    branch.options[mix].is_drum_track = action.isDrumTrack!
                    delete branch.pos
                }
            }
        })
    }
    case "update_instrument":
        return produce(bgm, draft => {
            const instrument = draft.instruments[action.index]
            Object.assign(instrument, action.partial)
        })
    case "add_instrument":
        return bgmReducer({ ...bgm, instruments: [...bgm.instruments, action.instrument] }, {
            type: "update_track_command",
            trackList: action.trackList,
            track: action.track,
            command: { id: action.event.id, SetTrackVoice: { index: bgm.instruments.length } } as unknown as Event,
        }, mix)
    case "split_variation":
        return Bridge.bgm_split_variation_at(bgm, action.variation, action.time)
    case "set_beats_per_bar":
        return { ...bgm, beats_per_bar: action.beatsPerBar }
    case "insert_track_command":
        return editTrack(bgm, action.trackList, action.track, mix, commands =>
            Bridge.commands_insert(commands, action.time, action.command))
    case "place_track_command":
        return editTrack(bgm, action.trackList, action.track, mix, commands =>
            Bridge.commands_place(commands, action.id, action.time, action.command))
    case "place_track_commands":
        return editTrack(bgm, action.trackList, action.track, mix, commands =>
            action.places.reduce((commands, { id, time, command }) => Bridge.commands_place(commands, id, time, command), commands))
    case "insert_track_commands":
        return editTrack(bgm, action.trackList, action.track, mix, commands =>
            action.inserts.reduce((commands, { time, command }) => Bridge.commands_insert(commands, time, command), commands))
    case "delete_track_commands":
        // Deleting a delay would move everything after it
        return editTrack(bgm, action.trackList, action.track, isOwnCommand(bgm, action, action.ids) ? undefined : mix, commands =>
            commands.filter(event => "Delay" in event || !action.ids.includes(event.id)))
    case "vary_by_mix": {
        const mixes = Math.max(2, mixCount(bgm))
        let changed = bgm
        for (const id of action.trackLists) {
            const track = changed.track_lists[id]?.tracks[action.track]
            if (!track || track.commands.length === 0 || variesByMix(track.commands)) continue
            const { commands, branches } = Bridge.commands_vary_by_mix(track.commands, changed.branches, action.interval, mixes, track.is_drum_track)
            changed = withTrack({ ...changed, branches }, id, action.track, ({ pos: _, ...track }) => ({ ...track, commands }))
        }
        return changed
    }
    case "stop_varying_by_mix": {
        let changed = bgm
        for (const id of action.trackLists) {
            const track = changed.track_lists[id]?.tracks[action.track]
            if (!track || !variesByMix(track.commands)) continue
            // The track plays drums if the mix's passages do
            const first = (Bridge.commands_without_detours(track.commands) as Event[]).find(event => "Branch" in event)
            const options = first && "Branch" in first ? bgm.branches[first.Branch.branch]?.options : undefined
            const isDrumTrack = (options?.[mix] ?? options?.[0])?.is_drum_track ?? track.is_drum_track
            changed = withTrack(changed, id, action.track, ({ pos: _, ...track }) => ({
                ...track,
                is_drum_track: isDrumTrack,
                commands: Bridge.commands_for_mix(track.commands, branchesPlayedBy(track.commands, bgm.branches), mix),
            }))
        }
        return withoutUnplayedBranches(changed)
    }
    case "add_mix":
        return Bridge.bgm_add_mix(bgm)
    case "remove_mix":
        return Bridge.bgm_remove_mix(bgm, action.mix)
    case "set_segment_length":
        return {
            ...bgm,
            track_lists: {
                ...bgm.track_lists,
                [action.trackList]: Bridge.track_list_set_length(bgm.track_lists[action.trackList], action.length),
            },
        }
    case "set_mix_name": {
        const mix_names = { ...bgm.mix_names }
        if (action.name) {
            mix_names[action.mix] = action.name
        } else {
            delete mix_names[action.mix]
        }
        return { ...bgm, mix_names }
    }
    }
}

export const useBgm = (docId?: string): [Bgm | undefined, (action: BgmAction) => void] => {
    const [doc, dispatch] = useDoc(docId)
    return [doc?.bgm, action => dispatch({ type: "bgm", action })]
}
