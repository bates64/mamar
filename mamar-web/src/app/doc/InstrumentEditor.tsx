import { NumberField } from "@adobe/react-spectrum"
import { Bgm, Event, Instrument, PatchAddress } from "pm64-typegen"

import styles from "./InstrumentEditor.module.scss"
import { toEvent } from "./useLaneEditing"

import { useAuxBankCount } from "../emu/SongPlayer"
import * as instruments from "../instruments"
import { useBgm } from "../store"
import { auxBankFor } from "../store/bgm"
import { useOptionalSoundBank } from "../util/hooks/useSoundBank"
import { auxBankFiles } from "../util/soundBank"

/** A byte the engine reads as signed. */
function signed(byte: number): number {
    return byte > 127 ? byte - 256 : byte
}

/** What a new instrument starts as when the track has no instrument to copy, as a MIDI file's instruments do. */
const NEW_INSTRUMENT: Instrument = {
    patch: { bank_set: "Music", bank: 0, instrument: 0, envelope: 0 },
    volume: 100,
    pan: 64,
    reverb: 0,
    coarse_tune: 0,
    fine_tune: 0,
}

/** A choice of sound: a sound in a music bank, as its lowest recording, or one of a BK file a song can load. */
function soundKey(sound: { bank: number, instrument: number } | { file: string, instrument: number }): string {
    return "file" in sound ? `aux:${sound.file}:${sound.instrument}` : `music:${sound.bank}:${sound.instrument}`
}

/**
 * Chooses the sound `patch` plays, from the sounds in the game's music banks, and those the ROM's songs load into their
 * aux banks, while the song has an aux bank free for them. Choosing one loads it into a free aux bank. A native list,
 * as a Spectrum picker's own popup would count as outside the popup it's in and close it.
 */
export function SoundSelect({ patch, onChange }: { patch: PatchAddress, onChange(patch: PatchAddress): void }) {
    const [bgm, dispatch] = useBgm()
    const sbn = useOptionalSoundBank()
    const auxBankCount = useAuxBankCount()
    const auxBanks = bgm?.aux_banks ?? []

    let selected = ""
    if (patch.bank_set === "Music") {
        selected = soundKey(instruments.recordingsOf(patch)[0])
    } else if (patch.bank_set === "Aux" && auxBanks[patch.bank]) {
        selected = soundKey({ file: auxBanks[patch.bank], instrument: patch.instrument })
    }
    const auxFiles = (sbn ? auxBankFiles(sbn) : []).filter(file =>
        file.instruments.length > 0 && bgm && auxBankFor(bgm, file.name, auxBankCount) !== undefined)
    const isListed = patch.bank_set === "Music"
        ? instruments.musicBanks.some(bank => bank.families.some(family => soundKey(family.recordings[0]) === selected))
        : auxFiles.some(file => file.name === auxBanks[patch.bank] && file.instruments.includes(patch.instrument))

    return <label className={styles.field}>
        Sound
        <select
            value={isListed ? selected : ""}
            onChange={event => {
                const [kind, bank, instrument] = event.target.value.split(":")
                if (kind === "music") {
                    onChange({ ...patch, bank_set: "Music", bank: Number(bank), instrument: Number(instrument) })
                } else if (kind === "aux" && bgm) {
                    const slot = auxBankFor(bgm, bank, auxBankCount)
                    if (slot !== undefined) {
                        dispatch({ type: "use_aux_bank", file: bank, count: auxBankCount })
                        onChange({ ...patch, bank_set: "Aux", bank: slot, instrument: Number(instrument) })
                    }
                }
            }}
        >
            {!isListed && <option value="">{instruments.getName(patch, auxBanks)}</option>}
            {instruments.musicBanks.map(bank => <optgroup key={bank.name} label={bank.name}>
                {bank.families.map(family => <option key={family.name} value={soundKey(family.recordings[0])}>
                    {family.name}
                </option>)}
            </optgroup>)}
            {auxFiles.map(file => <optgroup key={file.name} label={file.name}>
                {file.instruments.map(instrument => <option key={instrument} value={soundKey({ file: file.name, instrument })}>
                    {instruments.soundName(file.name, instrument)}
                </option>)}
            </optgroup>)}
        </select>
    </label>
}

/** The other tracks that play instrument `index` somewhere in the song, by their rows. */
function otherTracksPlaying(bgm: Bgm, index: number, row: number): number[] {
    const rows = new Set<number>()
    for (const trackList of Object.values(bgm.track_lists)) {
        trackList.tracks.forEach((track, i) => {
            if (i !== row && track.commands.some(event => "SetTrackVoice" in event && event.SetTrackVoice.index === index)) {
                rows.add(i)
            }
        })
    }
    return [...rows].sort((a, b) => a - b)
}

function listOf(names: string[]): string {
    return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/**
 * Chooses which of the song's instruments `event` sets track `trackIndex` of track list `trackListId` to, and edits
 * that instrument: its sound, volume, pan, reverb, and tuning. Every track that plays the instrument changes with it, so
 * it can be copied for this track alone.
 */
export default function InstrumentEditor({ event, trackListId, trackIndex }: {
    event: Event & { SetTrackVoice: { index: number } }
    trackListId: number
    trackIndex: number
}) {
    const [bgm, dispatch] = useBgm()
    if (!bgm) return null

    const index = event.SetTrackVoice.index
    const instrument = bgm.instruments[index]
    const update = (partial: Partial<Instrument>) => dispatch({ type: "update_instrument", index, partial })
    const addInstrument = (instrument: Instrument) => dispatch({
        type: "add_instrument",
        instrument,
        trackList: trackListId,
        track: trackIndex,
        event,
    })
    const others = otherTracksPlaying(bgm, index, trackIndex)
    const number = (label: string, value: number, min: number, max: number, onChange: (value: number) => void) => <NumberField
        label={label}
        value={value}
        minValue={min}
        maxValue={max}
        formatOptions={{ maximumFractionDigits: 0 }}
        width="100%"
        hideStepper
        onChange={value => {
            if (!Number.isNaN(value)) {
                onChange(Math.round(value))
            }
        }}
    />

    return <div className={styles.editor}>
        <label className={styles.field}>
            Instrument
            <select
                value={index}
                onChange={change => {
                    if (change.target.value === "new") {
                        addInstrument(instrument ? { ...instrument, patch: { ...instrument.patch } } : NEW_INSTRUMENT)
                    } else {
                        dispatch({
                            type: "update_track_command",
                            trackList: trackListId,
                            track: trackIndex,
                            command: toEvent({ SetTrackVoice: { index: Number(change.target.value) } }, event.id),
                        })
                    }
                }}
            >
                {bgm.instruments.map((instrument, i) => <option key={i} value={i}>
                    {i}: {instruments.getName(instrument.patch, bgm.aux_banks)}
                </option>)}
                <option value="new">New instrument</option>
            </select>
        </label>
        {instrument && <>
            <SoundSelect patch={instrument.patch} onChange={patch => update({ patch })} />
            <div className={styles.row}>
                {number("Volume", instrument.volume, 0, 255, volume => update({ volume }))}
                {number("Pan", instrument.pan, 0, 127, pan => update({ pan }))}
            </div>
            <div className={styles.row}>
                {number("Reverb", instrument.reverb, 0, 255, reverb => update({ reverb }))}
                {number("Envelope", instrument.patch.envelope, 0, 3, envelope => update({ patch: { ...instrument.patch, envelope } }))}
            </div>
            <div className={styles.row}>
                {number("Tune (semitones)", signed(instrument.coarse_tune), -128, 127, coarse => update({ coarse_tune: coarse & 0xFF }))}
                {number("Fine tune (cents)", signed(instrument.fine_tune), -128, 127, fine => update({ fine_tune: fine & 0xFF }))}
            </div>
            {others.length > 0 && <div className={styles.shared}>
                <span>Changes here also change {others.length === 1 ? "track" : "tracks"} {listOf(others.map(String))}.</span>
                <button className={styles.copy} onClick={() => addInstrument({ ...instrument, patch: { ...instrument.patch } })}>
                    Copy for this track
                </button>
            </div>}
        </>}
    </div>
}
