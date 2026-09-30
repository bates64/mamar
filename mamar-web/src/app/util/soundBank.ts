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

/** The name of file `index` of the sound bank, such as "GM03", or undefined if it has no such file. */
export function fileName(sbn: ArrayBuffer, index: number): string | undefined {
    const view = new DataView(sbn)
    if (index >= view.getUint32(0x14)) {
        return undefined
    }
    const file = view.getUint32(0x40 + index * 8) & 0xFFFFFF
    return String.fromCharCode(...new Uint8Array(sbn, file + 8, 4))
}

/** The index of the sound bank's file named `name`, or undefined if it has none. */
export function fileIndexOf(sbn: ArrayBuffer, name: string): number | undefined {
    const count = new DataView(sbn).getUint32(0x14)
    for (let i = 0; i < count; i++) {
        if (fileName(sbn, i) === name) {
            return i
        }
    }
    return undefined
}

/** The sound bank's file index of each of `names`, the BK files a song loads into its aux banks, or 0 for none. */
export function auxBankIndexes(sbn: ArrayBuffer | null, names: string[] = []): number[] {
    return names.map(name => (sbn && name ? fileIndexOf(sbn, name) ?? 0 : 0))
}

/** A BK file a song can load into an aux bank, with the instruments it has. */
export interface AuxBankFile {
    name: string
    instruments: number[]
}

const auxBankFilesCache = new WeakMap<ArrayBuffer, AuxBankFile[]>()

/**
 * The BK files that songs can load into their aux banks: those the INIT file doesn't load into a bank of its own, which
 * the ROM's songs load theirs from.
 */
export function auxBankFiles(sbn: ArrayBuffer): AuxBankFile[] {
    const cached = auxBankFilesCache.get(sbn)
    if (cached) {
        return cached
    }
    const view = new DataView(sbn)
    const fileCount = view.getUint32(0x14)
    const init = view.getUint32(0x24)
    const files: AuxBankFile[] = []
    if (init === 0) {
        return files
    }

    const loaded = new Set<number>()
    const bankList = init + view.getUint16(init + 0x08)
    for (let entry = bankList; entry + 4 <= bankList + view.getUint16(init + 0x0A); entry += 4) {
        const fileIndex = view.getUint16(entry)
        if (fileIndex === 0xFFFF) break
        loaded.add(fileIndex)
    }

    for (let i = 0; i < fileCount; i++) {
        const file = view.getUint32(0x40 + i * 8) & 0xFFFFFF
        // "BK  "
        if (loaded.has(i) || view.getUint32(file) !== 0x424B2020) continue
        const instruments = []
        for (let instrument = 0; instrument < 16; instrument++) {
            if (view.getUint16(file + 0x12 + instrument * 2) !== 0) {
                instruments.push(instrument)
            }
        }
        files.push({ name: fileName(sbn, i)!, instruments })
    }

    auxBankFilesCache.set(sbn, files)
    return files
}

/** The songs of the INIT file's song list: the BGM file each plays, and the BK files it loads into its aux banks. */
function songEntries(sbn: ArrayBuffer): { bgmFile: number, bkFiles: number[] }[] {
    const view = new DataView(sbn)
    const init = view.getUint32(0x24)
    const songs = []
    if (init === 0) {
        return []
    }
    const songList = init + view.getUint16(init + 0x0C)
    for (let entry = songList; entry + 8 <= songList + view.getUint16(init + 0x0E); entry += 8) {
        const bgmFile = view.getUint16(entry)
        if (bgmFile === 0xFFFF) break
        songs.push({ bgmFile, bkFiles: [1, 2, 3].map(i => view.getUint16(entry + i * 2)) })
    }
    return songs
}

/**
 * The BK files the ROM's song whose BGM file is `bgm` loads into its aux banks, by name, with an empty name for a bank it
 * leaves empty, or none if it isn't one of the ROM's songs.
 */
export function romAuxBanks(sbn: ArrayBuffer, bgm: Uint8Array): string[] {
    const view = new DataView(sbn)
    for (const { bgmFile, bkFiles } of songEntries(sbn)) {
        const file = view.getUint32(0x40 + bgmFile * 8) & 0xFFFFFF
        const size = view.getUint32(file + 4)
        const data = new Uint8Array(sbn, file, size)
        if (size === bgm.length && data.every((byte, i) => byte === bgm[i])) {
            const names = bkFiles.map(index => (index === 0 ? "" : fileName(sbn, index) ?? ""))
            while (names.length > 0 && names[names.length - 1] === "") names.pop()
            return names
        }
    }
    return []
}
