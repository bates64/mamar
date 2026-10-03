import { Bgm, Command, Event, PatchAddress, Track, TrackList } from "pm64-typegen"
import { getUntrackedObject } from "react-tracked"

import { releasesOf } from "./soundBank"

import Bridge from "../bridge"
import { timeline } from "../doc/lanes"
import { highestPitch, recordingsOf, Sample, sampleOf } from "../doc/pitchLimit"
import { TICKS_PER_BEAT, trackListLength } from "../doc/Ruler"
import { branchesPlayedBy, mixCount, variesByMix } from "../store/bgm"

// The engine plays a sample up to about an octave above the pitch it was recorded at, so many instruments are recorded
// at several pitches, such as "E. Piano 1 C5", "C6", and "C7". Mamar treats an instrument's recordings as one instrument
// covering all their pitches: when a song is built, each track switches to the lowest recording that plays its highest
// note at each time, with a patch override. When a song is opened, those switches are taken out again, for each track
// whose switches are exactly the ones building it would add. Tracks are built as they were opened until they're edited,
// so a song that isn't changed saves exactly as it was.

function isSamePatch(a: PatchAddress | undefined, b: PatchAddress | undefined): boolean {
    return a === b || (a !== undefined && b !== undefined && a.bank_set === b.bank_set && a.bank === b.bank &&
        a.instrument === b.instrument && a.envelope === b.envelope)
}

/** A byte the engine reads as signed. */
function signed(byte: number): number {
    return byte > 127 ? byte - 256 : byte
}

/**
 * Whether `sample`, tuned by `tune` cents, plays `pitch` at its own pitch. A sample that isn't in the sound bank's
 * banks might play any pitch.
 */
function plays(sample: Sample | null, tune: number, pitch: number): boolean {
    const limit = sample ? highestPitch(sample, tune) : undefined
    return limit === undefined || pitch <= limit
}

/** Whether `patch` is another recording of the instrument `chosen` is one of. */
function isRecordingOf(sbn: ArrayBuffer, patch: PatchAddress, chosen: PatchAddress): boolean {
    return recordingsOf(sbn, chosen).some(recording => isSamePatch(recording.patch, patch))
}

/**
 * What a track plays as it's built: the instrument it was given, the recording of it that's playing, and its tuning in
 * cents. A track keeps these from one segment to the next.
 */
interface State {
    chosen?: PatchAddress
    playing?: PatchAddress
    tune: number
}

/** Updates `state` for `event`, which chooses the track's instrument or tunes it, if it does. */
function choose(bgm: Bgm, state: State, event: Event) {
    if ("SetTrackVoice" in event) {
        // Choosing an instrument sets the track's tuning to the instrument's
        const instrument = bgm.instruments[event.SetTrackVoice.index]
        state.chosen = state.playing = instrument?.patch
        state.tune = instrument ? signed(instrument.coarse_tune) * 100 + signed(instrument.fine_tune) : 0
    } else if ("TrackOverridePatch" in event) {
        state.chosen = state.playing = event.TrackOverridePatch
    } else if ("SubTrackCoarseTune" in event) {
        state.tune = event.SubTrackCoarseTune * 100 + (state.tune % 100)
    } else if ("SubTrackFineTune" in event) {
        state.tune = Math.trunc(state.tune / 100) * 100 + event.SubTrackFineTune
    }
}

/** `track` with the switches between recordings it needs to play each note at its own pitch, from `state`. */
function addSwitches(bgm: Bgm, sbn: ArrayBuffer, track: Track, state: State): Track {
    const played = timeline(track.commands)
    const highest = new Map<number, number>()
    for (const { time, event } of played) {
        if ("Note" in event) {
            highest.set(time, Math.max(highest.get(time) ?? 0, event.Note.pitch))
        }
    }

    const inserts: { time: number, command: Command }[] = []
    for (const { time, event } of played) {
        choose(bgm, state, event)
        // The highest note at a time decides what plays then
        if (!("Note" in event) || !state.chosen || highest.get(time) !== event.Note.pitch) {
            continue
        }
        highest.delete(time)

        let wanted = state.chosen
        if (!plays(sampleOf(sbn, state.chosen), state.tune, event.Note.pitch)) {
            for (const recording of recordingsOf(sbn, state.chosen)) {
                if (plays(recording.sample, state.tune, event.Note.pitch)) {
                    wanted = recording.patch
                    break
                }
            }
        }
        if (!isSamePatch(wanted, state.playing)) {
            inserts.push({ time, command: { TrackOverridePatch: wanted } })
            state.playing = wanted
        }
    }

    let commands = track.commands
    for (const { time, command } of inserts) {
        commands = Bridge.commands_insert(commands, time, command)
    }
    return { ...track, commands }
}

/**
 * Each track as it was opened, by the commands it was opened with, which building puts back as it was while the track
 * still has those commands. So an unedited track plays and saves as it was, even where it plays notes higher than its
 * instrument can, and a track switches were taken out of isn't laid out afresh, which would write out its detours.
 */
const opened = new WeakMap<object, Track>()

function untracked<T extends object>(value: T): T {
    return getUntrackedObject(value) ?? value
}

/**
 * `track` without the switches between recordings of the instrument it's playing, from `state`: overrides of its patch
 * with another recording of the instrument it was given. It's `track` itself if it has none.
 */
function removeSwitches(bgm: Bgm, sbn: ArrayBuffer, track: Track, state: State): Track {
    const commands = Bridge.commands_without_detours(track.commands) as Event[]
    const kept = commands.filter(event => {
        if ("TrackOverridePatch" in event && state.chosen && isRecordingOf(sbn, event.TrackOverridePatch, state.chosen)) {
            return false
        }
        choose(bgm, state, event)
        return true
    })
    if (kept.length === commands.length) {
        return track
    }
    const removed: Track = { ...track, commands: kept }
    delete removed.pos
    return removed
}

/** Updates `state` for what `track` plays, without changing it. */
function follow(bgm: Bgm, track: Track, state: State) {
    for (const { event } of timeline(track.commands)) {
        choose(bgm, state, event)
    }
}

/**
 * The song's track lists in the order the song first plays them, each with whether it starts a variation, where the
 * engine starts every track afresh, and then any the song doesn't play.
 */
function playOrder(bgm: Bgm): { id: number, startsVariation: boolean }[] {
    const order: { id: number, startsVariation: boolean }[] = []
    const seen = new Set<number>()
    for (const variation of bgm.variations) {
        let isFirst = true
        for (const segment of variation?.segments ?? []) {
            if ("Subseg" in segment && !seen.has(segment.Subseg.track_list)) {
                seen.add(segment.Subseg.track_list)
                order.push({ id: segment.Subseg.track_list, startsVariation: isFirst })
            }
            isFirst &&= !("Subseg" in segment)
        }
    }
    for (const id of Object.keys(bgm.track_lists).map(Number)) {
        if (!seen.has(id)) {
            order.push({ id, startsVariation: true })
        }
    }
    return order
}

/** A track, as the track list it's in and its index there. */
type TrackKey = `${number}:${number}`

/** Changes each track in the order the song plays them, carrying what each plays from one segment to the next. */
function mapTracks(bgm: Bgm, change: (key: TrackKey, track: Track, state: State) => Track): Bgm {
    const trackLists: Record<number, TrackList> = { ...bgm.track_lists }
    let states: State[] = []
    for (const { id, startsVariation } of playOrder(bgm)) {
        const trackList = bgm.track_lists[id]
        if (!trackList) continue
        if (startsVariation) {
            states = trackList.tracks.map(() => ({ tune: 0 }))
        }
        const current = states
        trackLists[id] = {
            ...trackList,
            tracks: trackList.tracks.map((track, index) => {
                const state = current[index] ??= { tune: 0 }
                return track.is_drum_track ? track : change(`${id}:${index}`, track, state)
            }) as TrackList["tracks"],
        }
    }
    return { ...bgm, track_lists: trackLists }
}

/**
 * Builds the song for the game: each track switches between recordings of its instrument as it needs, apart from those
 * in `kept`, and those still as they were opened when `restore` is set, which are left as they are. A track that varies
 * by mix switches in each mix's passages, from what it plays as it starts.
 */
function build(bgm: Bgm, sbn: ArrayBuffer, kept: ReadonlySet<TrackKey>, restore: boolean): Bgm {
    let branches = bgm.branches
    const built = mapTracks(bgm, (key, track, state) => {
        const original = restore ? opened.get(untracked(track.commands)) : undefined
        if (kept.has(key) || original) {
            follow(bgm, original ?? track, state)
            return original ?? track
        }
        if (!variesByMix(track.commands)) {
            return addSwitches(bgm, sbn, track, state)
        }
        let commands = track.commands
        let first: State | undefined
        for (let mix = 0; mix < mixCount(bgm); mix++) {
            const mixState = { ...state }
            const played: Event[] = Bridge.commands_for_mix(commands, branchesPlayedBy(commands, branches), mix)
            const switched = addSwitches(bgm, sbn, { ...track, commands: played }, mixState)
            const written = Bridge.commands_set_for_mix(commands, branches, mix, switched.commands)
            commands = written.commands
            branches = written.branches
            first ??= mixState
        }
        // The first mix plays as the song starts, so the tracks after this one carry on from it
        Object.assign(state, first)
        const switchedTrack: Track = { ...track, commands }
        delete switchedTrack.pos
        return switchedTrack
    })
    return { ...built, branches }
}

/** A track's commands without their IDs, to compare them. */
function commandsOf(track: Track): string {
    return JSON.stringify(Bridge.commands_without_detours(track.commands), (key, value) => (key === "id" ? undefined : value))
}

/**
 * Opens a song decoded from a BGM file, taking out the switches between recordings that building adds, for each track
 * whose switches are exactly those. Other tracks keep the overrides they have. Every track is remembered as it was
 * opened, so it's built as it was until it's edited.
 */
export function removeRecordings(bgm: Bgm, sbn: ArrayBuffer): Bgm {
    const kept = new Set<TrackKey>()
    // Tracks that vary by mix keep their overrides, as working out each mix's switches when a song opens is slow, and
    // they build as they were until they're edited
    for (const [id, trackList] of Object.entries(bgm.track_lists)) {
        trackList.tracks.forEach((track, index) => {
            if (variesByMix(track.commands)) {
                kept.add(`${Number(id)}:${index}`)
            }
        })
    }
    let removed = bgm
    // A kept track changes what the tracks after it carry from it, so check again until nothing changes
    for (let attempt = 0; attempt < 8; attempt++) {
        removed = mapTracks(bgm, (key, track, state) => {
            if (kept.has(key)) {
                follow(bgm, track, state)
                return track
            }
            return removeSwitches(bgm, sbn, track, state)
        })
        const rebuilt = build(removed, sbn, kept, false)

        let changed = false
        for (const [id, trackList] of Object.entries(bgm.track_lists)) {
            for (const [index, track] of trackList.tracks.entries()) {
                const key: TrackKey = `${Number(id)}:${index}`
                if (!kept.has(key) && commandsOf(rebuilt.track_lists[Number(id)].tracks[index]) !== commandsOf(track)) {
                    kept.add(key)
                    changed = true
                }
            }
        }
        if (!changed) break
    }

    for (const [id, trackList] of Object.entries(removed.track_lists)) {
        for (const [index, track] of trackList.tracks.entries()) {
            opened.set(track.commands, bgm.track_lists[Number(id)].tracks[index])
        }
    }
    return removed
}

/** Builds the song for the game: each track switches between recordings of its instrument as it needs. */
export function addRecordings(bgm: Bgm, sbn: ArrayBuffer): Bgm {
    return build(bgm, sbn, new Set(), true)
}

/** Whether `event` is a proximity mix override that marks where tracks fade to their volumes in the mix. */
function isMixFadePoint(event: Event): boolean {
    return "ProxMixOverride" in event && event.ProxMixOverride.volume1 === 0
}

/**
 * `bgm` with a point at the start of each bar of the master track where the tracks fade to their volumes in the
 * proximity mix, as the game's own songs have, if it has mixes and a track has a volume in a mix to fade to. A song
 * that places its own is left as it is.
 */
function withMixFadePoints(bgm: Bgm): Bgm {
    const trackLists = Object.values(bgm.track_lists)
    const played = (track: Track) => Bridge.commands_without_detours(track.commands) as Event[]
    const hasMixVolumes = trackLists.some(trackList => trackList.tracks.some(track =>
        played(track).some(event => "ProxMixOverride" in event && !isMixFadePoint(event))))
    const hasFadePoints = trackLists.some(trackList => played(trackList.tracks[0]).some(isMixFadePoint))
    if (mixCount(bgm) === 0 || !hasMixVolumes || hasFadePoints) {
        return bgm
    }

    const ticksPerBar = TICKS_PER_BEAT * (bgm.beats_per_bar ?? 4)
    const track_lists: Record<number, TrackList> = {}
    for (const [id, trackList] of Object.entries(bgm.track_lists)) {
        const [master, ...others] = trackList.tracks
        let commands = played(master)
        for (let time = 0; time < trackListLength(trackList, bgm.branches); time += ticksPerBar) {
            commands = Bridge.commands_insert(commands, time, { ProxMixOverride: { volume1: 0, volume2: 0 } })
        }
        const withFadePoints: Track = { ...master, commands }
        delete withFadePoints.pos
        track_lists[Number(id)] = { ...trackList, tracks: [withFadePoints, ...others] as TrackList["tracks"] }
    }
    return { ...bgm, track_lists }
}

/**
 * Encodes the song as the game plays it, switching between recordings of each track's instrument as it needs and
 * giving tracks voices for their notes to ring on with when the user's sound bank is known, and with the points where
 * tracks fade to their volumes in a proximity mix.
 */
export function encodeForGame(bgm: Bgm, sbn: ArrayBuffer | null): Uint8Array {
    const song = withMixFadePoints(sbn ? addRecordings(bgm, sbn) : bgm)
    const encoded: Uint8Array | string = Bridge.bgm_encode(song, sbn ? releasesOf(sbn, song) : null)
    if (typeof encoded === "string") {
        throw new Error(encoded)
    }
    return encoded
}
