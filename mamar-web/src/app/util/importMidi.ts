import { encodeToSave } from "./recordings"

import { ensureBridge } from "../bridge"
import { sampleReach } from "../doc/pitchLimit"
import { decode } from "../store/root"

/**
 * Which soundfont a MIDI file was made for, which says how to read its programs and drum notes: General MIDI, as most
 * are, or Paper Mario's, whose instruments are the game's own samples.
 */
export type MidiMapping = "GeneralMidi" | "PaperMario"

/**
 * Makes a song from MIDI file `data`, named `name`, reading its programs and drum notes as `mapping` says, and encodes
 * it to save, playing the instruments of sound bank `sbn`. The song can be reimported from the file.
 */
export async function importMidi(data: Uint8Array, name: string, mapping: MidiMapping, sbn: ArrayBuffer): Promise<Uint8Array> {
    await ensureBridge()
    const { bgm, importBase } = decode(data, sbn, name, mapping, sampleReach(sbn))
    return encodeToSave(bgm, importBase, sbn)
}
