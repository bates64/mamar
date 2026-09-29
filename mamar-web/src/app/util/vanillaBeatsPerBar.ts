/**
 * Beats per bar of the vanilla songs that aren't in 4/4, keyed by the FNV-1a hash of their BGM file. The files don't
 * store a time signature; these were worked out from how each song's segments divide into bars and where its notes
 * fall.
 */
const VANILLA_BEATS_PER_BAR: Record<number, number> = {
    0x343c5ca0: 3, // Huff N. Puff Theme
    0xd1b0dabd: 3, // Forever Forest
    0xc24dbc6e: 3, // Toybox Train
    0x39b5b943: 3, // Cloudy Climb
    0x4ec24b65: 3, // Flower Fields Sunny
    0x1149b0d0: 3, // Crystal Palace
    0x42e2dc27: 3, // Star Way Opens
    0x7210f3bc: 3, // Prisoner Peach Theme
    0xfe236089: 3, // Flower NPC Theme
    0xb0159afd: 3, // Boo Minigame
    0x7bfd8538: 3, // Chapter End
    0xee38138e: 3, // New Partner (JP)
}

function fnv1a(data: Uint8Array): number {
    let hash = 0x811c9dc5
    for (const byte of data) {
        hash ^= byte
        hash = Math.imul(hash, 0x01000193)
    }
    return hash >>> 0
}

/** Beats per bar of `data` if it's a vanilla BGM file that isn't in 4/4. */
export default function vanillaBeatsPerBar(data: Uint8Array): number | undefined {
    return VANILLA_BEATS_PER_BAR[fnv1a(data)]
}
