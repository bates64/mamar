import { PatchAddress } from "pm64-typegen"

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

const BANK_SETS: PatchAddress["bank_set"][] = ["Aux", "Set2", "Default", "Music", "Set4", "Set5", "Set6", "AuxCopy"]

/**
 * The patches of the drum kit that every song's percussion can play, from the sound bank's PER file: the drums that
 * pitches 0x80 to 0xC7 play. The song's own drums follow them.
 */
export function kitDrums(sbn: ArrayBuffer): PatchAddress[] {
    const view = new DataView(sbn)
    const fileCount = view.getUint32(0x14)
    const init = view.getUint32(0x24)
    if (init === 0) {
        return []
    }
    // The INIT file lists the sound effects, drum kit, and instrument files, in that order
    const extraFiles = init + view.getUint16(init + 0x10)
    const perIndex = view.getUint16(extraFiles + 2)
    if (perIndex >= fileCount) {
        return []
    }
    const per = view.getUint32(0x40 + perIndex * 8) & 0xFFFFFF
    const size = view.getUint32(per + 4)

    const drums: PatchAddress[] = []
    for (let offset = 0x10; offset + 12 <= size; offset += 12) {
        const rawBank = view.getUint8(per + offset)
        const rawPatch = view.getUint8(per + offset + 1)
        drums.push({
            bank_set: BANK_SETS[(rawBank & 0x70) >> 4],
            bank: rawPatch >> 4,
            instrument: rawPatch & 0xF,
            envelope: rawBank & 3,
        })
    }
    return drums
}
