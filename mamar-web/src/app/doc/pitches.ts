/**
 * The pitches the engine plays as notes, which are the piano roll's rows, from the bottom to the top. The engine plays a
 * note's low 7 bits as semitones from its instrument's base key, which is the pitch its sample was recorded at. So a
 * note sounds at its name when its instrument's name gives the pitch it was recorded at, such as "E. Piano 1 C5".
 * Matches the renderer.
 */
export const LOWEST_PITCH = 0x80
export const HIGHEST_PITCH = 0xD3

/** Height of a pitch's row, in CSS pixels. Matches the renderer. */
export const NOTE_HEIGHT = 12

const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]

/**
 * A pitch's name, such as C5, in the octaves the instruments are named in, where the lowest pitch is C2. MIDI import
 * reads MIDI's C4, note 60, as that C5.
 */
export function pitchName(pitch: number): string {
    const note = pitch - LOWEST_PITCH
    return `${NAMES[note % 12]}${Math.floor(note / 12) + 2}`
}
