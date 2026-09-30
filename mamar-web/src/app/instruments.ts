import { PatchAddress } from "pm64-typegen"

import soundNames from "./soundNames.json"

export enum MusicBankSet {
    BK_96_GM01,
    BK_97_GM02,
    BK_98_GM03,
    BK_99_GM04,
    BK_9A_GM05,
    BK_9B_GM06,
    BK_9C_GM07,
    BK_9D_GM08,
    BK_9E_GM09,
    BK_9F_GM10,
    BK_A0_GM11,
    BK_90_PS01,
    BK_91_PS02,
    BK_92_PS03,
    BK_93_PS04,
    BK_94_PS05,
}

/**
 * The names of the samples in the sound bank's BK files, by file and then instrument, from Star Rod Classic's list of
 * them. A sample it doesn't know the name of is null.
 */
const SOUND_NAMES: Record<string, Record<string, string | null> | undefined> = soundNames

/** The BK file each music bank loads, such as "GM03". */
function musicBankFile(bank: number): string | undefined {
    return MusicBankSet[bank]?.slice(-4)
}

/**
 * The BK file `patch` plays a sample from, such as "GM03", or undefined if it isn't in a music bank or one of `auxBanks`,
 * the BK files a song loads into its aux banks.
 */
export function bankFileOf({ bank_set, bank }: PatchAddress, auxBanks: string[] = []): string | undefined {
    if (bank_set === "Music") {
        return musicBankFile(bank)
    } else if (bank_set === "Aux") {
        return auxBanks[bank] || undefined
    }
    return undefined
}

/** The name of instrument `instrument` of BK file `file`, including the pitch it was recorded at, if it has one. */
export function soundName(file: string, instrument: number): string {
    return SOUND_NAMES[file]?.[instrument] ?? `${file} ${instrument.toString(16).toUpperCase().padStart(2, "0")}`
}

/** The name of the sample `patch` plays, including the pitch it was recorded at, if it has one. */
export function sampleName(patch: PatchAddress, auxBanks: string[] = []): string {
    const file = bankFileOf(patch, auxBanks)
    if (file) {
        return soundName(file, patch.instrument)
    }
    const bankHex = patch.bank.toString(16).toUpperCase()
    const instrumentHex = patch.instrument.toString(16).toUpperCase()
    return `[${patch.bank_set} ${bankHex}/${instrumentHex}]`
}

/** An instrument's name without the pitch its sample was recorded at, which its recordings at other pitches share. */
export function familyName(name: string): string {
    return name.replace(/ [A-G]#?\d$/, "")
}

/**
 * The name of the sound `patch` plays, such as "Electric Piano 1". Its recordings at other pitches share it, as Mamar
 * switches between them to play each note. See util/recordings.
 */
export function getName(patch: PatchAddress, auxBanks: string[] = []): string {
    return familyName(sampleName(patch, auxBanks))
}

/** A sound in the music banks, as each of its recordings, from the lowest listed. */
export interface SoundFamily {
    name: string
    recordings: { bank: MusicBankSet, instrument: number }[]
}

/** Sounds that are copies of ones in another bank, which the list leaves out. */
const DUPLICATES = new Set([
    `${MusicBankSet.BK_9F_GM10}:${0xD}`,
    `${MusicBankSet.BK_92_PS03}:${0xF}`,
    `${MusicBankSet.BK_94_PS05}:${0xF}`,
])

/**
 * The sounds in each music bank, named by its BK file, with each sound's recordings at different pitches as one, in
 * the first bank that has one of them.
 */
export const musicBanks: { name: string, families: SoundFamily[] }[] = []
const families = new Map<string, SoundFamily>()
for (let bank = 0; musicBankFile(bank); bank++) {
    const file = musicBankFile(bank)!
    const musicBank = { name: file, families: [] as SoundFamily[] }
    for (const instrument of Object.keys(SOUND_NAMES[file] ?? {}).map(Number).sort((a, b) => a - b)) {
        if (DUPLICATES.has(`${bank}:${instrument}`)) continue
        const name = familyName(soundName(file, instrument))
        let family = families.get(name)
        if (!family) {
            family = { name, recordings: [] }
            families.set(name, family)
            musicBank.families.push(family)
        }
        family.recordings.push({ bank, instrument })
    }
    musicBanks.push(musicBank)
}

/** The recordings of the sound `patch` plays, including its own, which only sounds in the music banks have others of. */
export function recordingsOf(patch: PatchAddress): PatchAddress[] {
    const family = patch.bank_set === "Music" ? families.get(getName(patch)) : undefined
    if (!family?.recordings.some(({ bank, instrument }) => bank === patch.bank && instrument === patch.instrument)) {
        return [patch]
    }
    return family.recordings.map(({ bank, instrument }) => ({ ...patch, bank, instrument }))
}
