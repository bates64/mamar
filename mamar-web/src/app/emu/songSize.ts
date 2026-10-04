/**
 * The most bytes a song can be for papermario-dx's BGM players to load it, for builds of mamar-audio from before it
 * said.
 */
const DEFAULT_MAX_SONG_SIZE = 0x5000

/** The most bytes a song can be for `engine`, a build of mamar-audio, to play it. */
export function maxSongSize(engine: { mamar_audio_bgm_max_size?(): number }): number {
    return engine.mamar_audio_bgm_max_size?.() ?? DEFAULT_MAX_SONG_SIZE
}

function kilobytes(bytes: number): string {
    return `${(bytes / 1024).toFixed(1).replace(/\.0$/, "")} KB`
}

/** Explains that a song of `size` bytes won't play, as the most the game can load is `maxSize` bytes. */
export function songTooBig(size: number, maxSize: number): string {
    return `This song is ${kilobytes(size)}, but the game can only load songs up to ${kilobytes(maxSize)}, so it won't ` +
        "play here or in the game. To make it smaller, remove notes or other commands, or play repeated sections with " +
        "loops rather than copies."
}
