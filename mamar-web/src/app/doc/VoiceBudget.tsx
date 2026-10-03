import { ActionButton, Flex, Text } from "@adobe/react-spectrum"
import classNames from "classnames"
import { Voices } from "pm64-typegen"

import { useTime } from "./TimeProvider"
import styles from "./VoiceBudget.module.scss"
import { MUSIC_VOICES, budget, sharesVoices, useVoiceReport, voiceRange } from "./voices"

import { useBgm, useDoc } from "../store"

/** Names the voices track `index` plays on that sound effects share, counting voices from 1. */
function describeShared(voices: Voices, index: number): string {
    const range = voiceRange(voices, index)
    const first = Math.max(range.first, MUSIC_VOICES)
    return range.end - first > 1 ? `voices ${first + 1}–${range.end}` : `voice ${range.end}`
}

/**
 * A label at a region's top right, or at the timeline's right edge while the region runs past it, when the regions it
 * plays with need more than the music has to itself: in red with the voices it's short of, if it gets fewer than it
 * needs, or in orange if it plays on voices sound effects share.
 */
export function VoiceBadge({ voices, index }: {
    voices: Voices
    /** The track whose voices the region plays on. */
    index: number
}) {
    const level = budget(voices)
    const needs = voices.needed[index]
    const gets = voices.given[index]
    // Vanilla tracks often have fewer voices than notes at once, letting a note cut off the end of the one before, so
    // this only warns of that when the regions need more voices than the game has
    if (level === "over" && gets < needs) {
        return <div className={styles.badgeRow}>
            <span className={classNames(styles.badge, styles.short)} title={`Gets ${gets} of the ${needs} voices it needs, so some notes are cut off`}>
                −{needs - gets} {needs - gets === 1 ? "voice" : "voices"}
            </span>
        </div>
    }
    if (level !== "fits" && sharesVoices(voices, index)) {
        return <div className={styles.badgeRow}>
            <span className={classNames(styles.badge, styles.shared)} title={`Plays on ${describeShared(voices, index)}, which sound effects share, so they can cut its notes off`}>
                shared
            </span>
        </div>
    }
    return null
}

/**
 * What's wrong with an open region's voices, if anything, with ways to fix it: showing where it plays the most notes
 * at once, and trimming the short overlaps that make it need a voice more.
 */
export function VoiceNote({ trackListId, trackIndex, segmentStart }: {
    trackListId: number
    trackIndex: number
    /** Where the region starts along the variation, in ticks. */
    segmentStart: number
}) {
    const [bgm, dispatch] = useBgm()
    const [, docDispatch] = useDoc()
    const report = useVoiceReport(trackListId)
    const time = useTime()
    const track = bgm?.track_lists[trackListId]?.tracks[trackIndex]
    if (!report || !track) {
        return null
    }
    const { voices } = report
    const level = budget(voices)
    // Alternate parts play on the voices of the tracks they're for
    const index = track.alternate_for ?? trackIndex
    const needs = voices.needed[index]
    const gets = voices.given[index]
    const isShort = level === "over" && gets < needs
    if (!isShort && !(level !== "fits" && sharesVoices(voices, index))) {
        return null
    }
    const use = report.tracks[trackIndex]
    const busiestAt = use.busiest_at

    return <div className={classNames(styles.note, isShort ? styles.short : styles.shared)}>
        <Text>
            {isShort
                ? `Gets ${gets} of the ${needs} voices it needs, so some notes are cut off.`
                : `Plays on ${describeShared(voices, index)}, which sound effects share, so they can cut its notes off.`}
        </Text>
        <Flex direction="column" alignItems="start">
            {needs > 1 && busiestAt != null && <ActionButton isQuiet onPress={() => {
                docDispatch({ type: "set_selection", selection: { trackList: trackListId, track: trackIndex, events: use.busiest_notes } })
                time.scrollToTicks(segmentStart + busiestAt)
            }}>
                Show busiest point
            </ActionButton>}
            {use.short_overlaps.length > 0 && <ActionButton isQuiet onPress={() =>
                dispatch({ type: "trim_short_overlaps", trackList: trackListId, tracks: [trackIndex] })}
            >
                Trim {use.short_overlaps.length} short overlaps
            </ActionButton>}
        </Flex>
    </div>
}
