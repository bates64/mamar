import { fnv1a } from "./vanillaBeatsPerBar"

/**
 * Names for the proximity mixes of the vanilla songs that have them, keyed by the FNV-1a hash of their BGM file, after
 * where in the game each mix plays: the place its music proximity trigger is at, in the maps' scripts.
 */
const VANILLA_MIX_NAMES: Record<number, Record<number, string>> = {
    // Toad Town. Mix 0 plays away from every trigger, and nothing plays mix 6.
    0x6995c2ca: {
        0: "Nowhere",
        1: "Tayce T",
        2: "Merluvlee",
        3: "Dojo",
        4: "Tunnels Pipe",
        5: "Flower Gate",
        6: "Unused",
        7: "Russ T",
        8: "Badge Shop",
        9: "Toy Box",
    },
}

/** Names for the proximity mixes of `data` if it's a vanilla BGM file with mixes. */
export default function vanillaMixNames(data: Uint8Array): Record<number, string> | undefined {
    return VANILLA_MIX_NAMES[fnv1a(data)]
}
