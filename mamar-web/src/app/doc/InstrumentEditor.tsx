import { ActionButton, ComboBox, Flex, Item, NumberField, Picker, Section } from "@adobe/react-spectrum"
import { Bgm, Event, Instrument, PatchAddress } from "pm64-typegen"
import { useId } from "react"

import styles from "./InstrumentEditor.module.scss"
import { formatPan } from "./lanes"
import { toEvent } from "./useLaneEditing"
import ValueSlider from "./ValueSlider"

import { useAuxBankCount } from "../emu/SongPlayer"
import * as instruments from "../instruments"
import { useBgm } from "../store"
import { auxBankFor } from "../store/bgm"
import { useOptionalSoundBank } from "../util/hooks/useSoundBank"
import { auxBankFiles, envelopesOf } from "../util/soundBank"
import { formatVolume } from "../util/volume"

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

interface SoundGroup {
    name: string
    sounds: { key: string, name: string }[]
}

/**
 * Chooses the sample `patch` plays, from the samples in the game's music banks, and those the ROM's songs load into
 * their aux banks, while the song has an aux bank free for them. Choosing one loads it into a free aux bank. Typing
 * searches the samples by name.
 */
export function SampleSelect({ patch, onChange }: { patch: PatchAddress, onChange(patch: PatchAddress): void }) {
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
    const groups: SoundGroup[] = [
        ...instruments.musicBanks.map(bank => ({
            name: bank.name,
            sounds: bank.families.map(family => ({ key: soundKey(family.recordings[0]), name: family.name })),
        })),
        ...auxFiles.map(file => ({
            name: file.name,
            sounds: file.instruments.map(instrument => ({
                key: soundKey({ file: file.name, instrument }),
                name: instruments.soundName(file.name, instrument),
            })),
        })),
    ]
    // A sound that isn't listed, such as one of the sound effect banks, is shown as it is until another is chosen
    if (!groups.some(group => group.sounds.some(sound => sound.key === selected))) {
        selected = "current"
        groups.unshift({ name: "Current", sounds: [{ key: selected, name: instruments.getName(patch, auxBanks) }] })
    }

    return <ComboBox
        label="Sample"
        width="100%"
        menuTrigger="focus"
        defaultItems={groups}
        selectedKey={selected}
        onSelectionChange={key => {
            const [kind, bank, instrument] = String(key ?? "").split(":")
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
        {group => <Section key={group.name} title={group.name} items={group.sounds}>
            {sound => <Item key={sound.key}>{sound.name}</Item>}
        </Section>}
    </ComboBox>
}

/** A time an envelope takes, such as "280 ms" or "3.3 s". */
function formatTime(seconds: number): string {
    return seconds < 1 ? `${Math.round(seconds * 100) * 10} ms` : `${Math.round(seconds * 10) / 10} s`
}

/** Words for how detached notes sound, by the least time they take to fade out once they end, in seconds. */
const ARTICULATIONS = [
    { from: 0.2, name: "Smooth" },
    { from: 0.08, name: "Normal" },
    { from: 0.03, name: "Short" },
    { from: 0, name: "Staccato" },
]

/** How detached a note sounds when it takes `release` seconds to fade out once it ends, such as "Short (50 ms)". */
function articulation(release: number): string {
    const { name } = ARTICULATIONS.find(({ from }) => release >= from)!
    return `${name} (${formatTime(release)})`
}

/** How many envelopes an instrument can have, as a patch chooses one in 2 bits. */
const ENVELOPE_COUNT = 4

/**
 * Chooses which of the envelopes of the instrument `patch` plays it plays with, by how long its notes take to fade out
 * once they end, which is how the game's instruments' envelopes differ. The engine plays an envelope the instrument
 * doesn't have with its default one.
 */
export function EnvelopeSelect({ patch, onChange }: { patch: PatchAddress, onChange(patch: PatchAddress): void }) {
    const [bgm] = useBgm()
    const sbn = useOptionalSoundBank()
    const envelopes = sbn ? envelopesOf(sbn, patch, bgm?.aux_banks) : null

    const names = envelopes?.map(envelope => articulation(envelope.release))
    const choices = Array.from({ length: ENVELOPE_COUNT }, (_, i) => {
        let name = names ? names[i] ?? "Default" : `Envelope ${i + 1}`
        // Envelopes that sound alike are told apart by number
        if (names && names.filter(other => other === name).length > 1) {
            name = `${i + 1}: ${name}`
        }
        return { key: String(i), name }
    }).filter((choice, i) => !envelopes || i < envelopes.length || i === patch.envelope)

    return <Picker
        label="Articulation"
        width="100%"
        items={choices}
        selectedKey={String(patch.envelope)}
        onSelectionChange={key => onChange({ ...patch, envelope: Number(key) })}
    >
        {choice => <Item key={choice.key}>{choice.name}</Item>}
    </Picker>
}

/** Fields that edit what `instrument` sounds like: its sample, articulation, volume, pan, reverb, and tuning. */
export function InstrumentFields({ instrument, onChange: update }: { instrument: Instrument, onChange(partial: Partial<Instrument>): void }) {
    // Tuning in semitones and in cents, which the engine adds together, as one number of semitones
    const transposeId = useId()
    const semitones = signed(instrument.coarse_tune) + signed(instrument.fine_tune) / 100
    const transpose = (semitones: number) => {
        const cents = Math.round(Math.min(127, Math.max(-128, semitones)) * 100)
        const coarse = Math.trunc(cents / 100)
        update({ coarse_tune: coarse & 0xFF, fine_tune: (cents - coarse * 100) & 0xFF })
    }

    return <>
        <SampleSelect patch={instrument.patch} onChange={patch => update({ patch })} />
        <EnvelopeSelect patch={instrument.patch} onChange={patch => update({ patch })} />
        {/* The engine reads only the low 7 bits of each */}
        <ValueSlider label="Volume" value={instrument.volume} min={0} max={127} format={formatVolume} onChange={volume => update({ volume })} />
        <ValueSlider label="Pan" value={instrument.pan} min={0} max={127} format={formatPan} fillOffset={64} onChange={pan => update({ pan })} />
        <ValueSlider label="Reverb" value={instrument.reverb} min={0} max={127} onChange={reverb => update({ reverb })} />
        {/* One label across the field and its buttons, as the field's own would be squeezed to its width */}
        <div className={styles.transpose}>
            <label htmlFor={transposeId}>Transpose (semitones)</label>
            <Flex gap="size-100">
                <NumberField
                    id={transposeId}
                    value={semitones}
                    minValue={-128}
                    maxValue={127}
                    step={0.01}
                    formatOptions={{ signDisplay: "exceptZero", maximumFractionDigits: 2 }}
                    flex={1}
                    minWidth={0}
                    hideStepper
                    onChange={semitones => !Number.isNaN(semitones) && transpose(semitones)}
                />
                <ActionButton aria-label="Down an octave" onPress={() => transpose(semitones - 12)}>−12</ActionButton>
                <ActionButton aria-label="Up an octave" onPress={() => transpose(semitones + 12)}>+12</ActionButton>
            </Flex>
        </div>
    </>
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

    return <div className={styles.editor}>
        {/* Which instrument the track plays heads the popup, and the fields below edit that instrument */}
        <label className={styles.heading}>
            <select
                aria-label="Instrument"
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
            <InstrumentFields instrument={instrument} onChange={update} />
            {others.length > 0 && <div className={styles.shared}>
                <span>Changes here also change {others.length === 1 ? "track" : "tracks"} {listOf(others.map(String))}.</span>
                <button className={styles.copy} onClick={() => addInstrument({ ...instrument, patch: { ...instrument.patch } })}>
                    Copy for this track
                </button>
            </div>}
        </>}
    </div>
}
