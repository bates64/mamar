/**
 * Finds the sound bank (SBN) in a Paper Mario ROM, which holds its music and the instruments it plays, or returns
 * null if it has none. Mods can move and resize it, so it's found by its signature.
 */
export function findSoundBank(rom: ArrayBuffer): ArrayBuffer | null {
    const bytes = new Uint8Array(rom)
    const view = new DataView(rom)

    for (let i = 0; i + 8 <= bytes.length; i += 0x10) {
        // "SBN "
        if (bytes[i] === 0x53 && bytes[i + 1] === 0x42 && bytes[i + 2] === 0x4E && bytes[i + 3] === 0x20) {
            return rom.slice(i, i + view.getUint32(i + 4))
        }
    }
    return null
}
