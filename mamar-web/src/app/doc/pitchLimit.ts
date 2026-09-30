import { PatchAddress } from "pm64-typegen"
import { useMemo } from "react"

import { timeline } from "./lanes"
import { LOWEST_PITCH } from "./pitches"
import { useCarriedValues, useMixCommands } from "./segmentTracks"

import * as instruments from "../instruments"
import { useBgm } from "../store"
import { useOptionalSoundBank } from "../util/hooks/useSoundBank"

/** The rate the engine outputs at, which each instrument's sample rate is relative to, in Hz. */
const OUTPUT_RATE = 32000

/** The most the resampler speeds a sample up by (MAX_RATIO), which is just under an octave. */
const MAX_RATIO = 1.99996

/** The most a note can be tuned up by, in cents, as the engine's table of pitch ratios goes no higher. */
const MAX_TUNING = 4095

/** The BankSet each patch's bank set is loaded as, from the INIT file's list of banks, or undefined if it isn't. */
const BANK_SETS: Partial<Record<PatchAddress["bank_set"], number>> = { Set2: 2, Music: 3, Set4: 4, Set5: 5, Set6: 6 }

/** An instrument's sample: the key it plays at its own pitch, in cents, and its sample rate. */
export interface Sample {
    keyBase: number
    sampleRate: number
}

/**
 * The sample `patch` plays, from the banks the sound bank's INIT file loads, or null if it's in a bank that isn't one of
 * those, such as a song's own.
 */
export function sampleOf(sbn: ArrayBuffer, patch: PatchAddress): Sample | null {
    const view = new DataView(sbn)
    const fileCount = view.getUint32(0x14)
    const init = view.getUint32(0x24)
    const bankSet = BANK_SETS[patch.bank_set]
    if (init === 0 || bankSet === undefined) {
        return null
    }

    const bankList = init + view.getUint16(init + 0x08)
    const bankListSize = view.getUint16(init + 0x0A)
    for (let entry = bankList; entry + 4 <= bankList + bankListSize; entry += 4) {
        const fileIndex = view.getUint16(entry)
        if (fileIndex === 0xFFFF || fileIndex >= fileCount) {
            break
        }
        if (view.getUint8(entry + 2) !== patch.bank || view.getUint8(entry + 3) !== bankSet) {
            continue
        }

        const bk = view.getUint32(0x40 + fileIndex * 8) & 0xFFFFFF
        const instrument = view.getUint16(bk + 0x12 + patch.instrument * 2)
        if (instrument === 0) {
            return null
        }
        return {
            keyBase: view.getUint16(bk + instrument + 0x1E),
            sampleRate: view.getInt32(bk + instrument + 0x20),
        }
    }
    return null
}

/**
 * The recordings of the same instrument as `patch`, including `patch`, with their samples, from the lowest to the
 * highest. Each plays a note at the same pitch, as its base key is the pitch it was recorded at.
 */
export function recordingsOf(sbn: ArrayBuffer, patch: PatchAddress): { patch: PatchAddress, sample: Sample }[] {
    const name = instruments.getName(patch)
    if (patch.bank_set !== "Music" || instruments.familyName(name) === name) {
        const sample = sampleOf(sbn, patch)
        return sample ? [{ patch, sample }] : []
    }
    const recordings = []
    for (const category of instruments.categories) {
        for (const other of category.instruments) {
            if (instruments.familyName(other.name) === instruments.familyName(name) && other.name !== instruments.familyName(other.name)) {
                const otherPatch = { ...patch, bank: other.bank, instrument: other.instrument }
                const sample = sampleOf(sbn, otherPatch)
                if (sample) {
                    recordings.push({ patch: otherPatch, sample })
                }
            }
        }
    }
    return recordings.sort((a, b) => a.sample.keyBase - b.sample.keyBase)
}

/**
 * The highest pitch `sample` plays at its own pitch when tuned by `tune` cents, or undefined if it plays every pitch.
 * Above it, the engine plays notes lower than they should be: the resampler can speed a sample up by just under an
 * octave, and its table of pitch ratios goes up by 4095 cents.
 */
export function highestPitch({ keyBase, sampleRate }: Sample, tune: number): number | undefined {
    if (sampleRate <= 0) {
        return undefined
    }
    const maxDetune = Math.min(MAX_TUNING, 1200 * Math.log2(MAX_RATIO * OUTPUT_RATE / sampleRate))
    // A note's detune is its low 7 bits in semitones, plus its tuning, less its instrument's base key. The limit is a
    // fraction of a cent under an octave, so allow a cent, as a note an octave up is too little off to hear.
    const highest = LOWEST_PITCH + Math.floor((maxDetune + 1 + keyBase - tune) / 100)
    return highest >= 0xD3 ? undefined : Math.max(LOWEST_PITCH - 1, highest)
}

/** A byte the engine reads as signed. */
function signed(byte: number): number {
    return byte > 127 ? byte - 256 : byte
}

/** The highest pitch a track plays at its own pitch from `time`, until the next limit, or undefined for none. */
export interface PitchLimit {
    time: number
    limit: number | undefined
}

/**
 * The highest pitch track `trackIndex` of track list `trackListId` plays at its own pitch through segment
 * `segmentIndex`, from the instrument and tuning it starts the segment with and each time they change. It's empty if
 * that's unknown. Percussion plays its drums at their own pitches, so it has no limit. A track switches to higher
 * recordings of its instrument as it needs, so its limit is the highest recording's. See util/recordings.
 */
export function usePitchLimits(trackListId: number, trackIndex: number, mainIndex: number, segmentIndex: number): PitchLimit[] {
    const [bgm] = useBgm()
    const sbn = useOptionalSoundBank()
    const carried = useCarriedValues(mainIndex, segmentIndex)
    const track = bgm?.track_lists[trackListId]?.tracks[trackIndex]
    const commands = useMixCommands(track?.commands)

    return useMemo(() => {
        if (!bgm || !sbn || !track || track.is_drum_track) {
            return []
        }
        const carriedValue = (key: string) => carried.values.find(value => value.kind.key === key)?.value

        // What the track has when the segment starts, from earlier segments
        const carriedInstrument = carriedValue("instrument")
        let patch = carried.patch ?? (carriedInstrument !== undefined ? bgm.instruments[carriedInstrument]?.patch : undefined)
        let coarse = carriedValue("coarseTune") ?? 0
        let fine = carriedValue("fineTune") ?? 0

        const limits: PitchLimit[] = []
        const update = (time: number) => {
            const recordings = patch ? recordingsOf(sbn, patch) : []
            const highest = recordings[recordings.length - 1]?.sample
            const limit = highest ? highestPitch(highest, coarse * 100 + fine) : undefined
            const last = limits[limits.length - 1]
            if (last?.time === time) {
                last.limit = limit
            } else if (!last || last.limit !== limit) {
                limits.push({ time, limit })
            }
        }
        update(0)
        for (const { time, event } of timeline(commands ?? [])) {
            if ("SetTrackVoice" in event) {
                // Choosing an instrument sets the track's tuning to the instrument's
                const instrument = bgm.instruments[event.SetTrackVoice.index]
                patch = instrument?.patch
                coarse = instrument ? signed(instrument.coarse_tune) : 0
                fine = instrument ? signed(instrument.fine_tune) : 0
            } else if ("TrackOverridePatch" in event) {
                patch = event.TrackOverridePatch
            } else if ("SubTrackCoarseTune" in event) {
                coarse = event.SubTrackCoarseTune
            } else if ("SubTrackFineTune" in event) {
                fine = event.SubTrackFineTune
            } else {
                continue
            }
            update(time)
        }
        return limits.every(({ limit }) => limit === undefined) ? [] : limits
    }, [bgm, sbn, track, commands, carried])
}
