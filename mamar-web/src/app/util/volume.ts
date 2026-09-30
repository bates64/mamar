/** The volume that plays a sound as loud as it is, which songs' volumes are out of. */
export const FULL_VOLUME = 127

/**
 * How loud `volume` plays, in decibels from full volume. The engine multiplies a note's volumes together and the mixer
 * squares the result, so each volume changes the sound's amplitude by its square.
 */
export function volumeToDecibels(volume: number): number {
    return volume <= 0 ? -Infinity : 40 * Math.log10(volume / FULL_VOLUME)
}

/** A volume as the decibels it plays at, such as "-5.0 dB", or "Silent" for none. */
export function formatVolume(volume: number): string {
    if (volume <= 0) {
        return "Silent"
    }
    const decibels = volumeToDecibels(volume)
    return `${decibels > 0.05 ? "+" : ""}${Math.abs(decibels) < 0.05 ? "0.0" : decibels.toFixed(1)} dB`
}
