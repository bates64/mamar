import { Content, ContextualHelp, Heading } from "@adobe/react-spectrum"
import Alert from "@spectrum-icons/workflow/Alert"
import classNames from "classnames"
import { TrackList, VoiceReport, Voices } from "pm64-typegen"
import { startTransition, useContext } from "react"

import { CONTEXT as PLAYHEAD_CONTEXT } from "./Playhead"
import { useInstrumentName } from "./segmentTracks"
import { useTime } from "./TimeProvider"
import styles from "./VoiceBudget.module.scss"
import { MAX_VOICES, MUSIC_VOICES, useVoiceReport, voiceProblem, voiceRange } from "./voices"

import { useBgm, useLocation, useRoot } from "../store"
import { playsDrums } from "../store/bgm"

/** How many of track `index`'s voices sound effects share. */
function sharedCount(voices: Voices, index: number): number {
    const { first, end } = voiceRange(voices, index)
    return end - Math.max(first, MUSIC_VOICES)
}

function plural(count: number, noun: string): string {
    return `${count} ${noun}${count === 1 ? "" : "s"}`
}

/**
 * A label at a region's top right, or at the timeline's right edge while the region runs past it, when the regions it
 * plays with need more than the music has to itself: in red with the voices it's short of, if it gets fewer than it
 * needs, or in orange if sound effects can cut its notes short, as it plays on voices they share.
 */
export function VoiceBadge({ trackList, voices, index }: {
    trackList: TrackList
    voices: Voices
    /** The track whose voices the region plays on. */
    index: number
}) {
    const problem = voiceProblem(trackList, voices, index)
    if (!problem) {
        return null
    }
    const needs = voices.needed[index]
    const gets = voices.given[index]
    return <div className={styles.badgeRow}>
        <span
            className={classNames(styles.badge, problem === "short" ? styles.short : styles.shared)}
            title={problem === "short"
                ? `Gets ${gets} of the ${needs} voices it needs, so some notes are cut short`
                : "Plays on voices that sound effects share, so they can cut its notes short"}
        >
            <Alert size="XS" UNSAFE_className={styles.badgeIcon} />
            {problem === "short" ? `−${plural(needs - gets, "voice")}` : "Shares voices with SFX"}
        </span>
    </div>
}

/** A way to free voices in a region: what to do, and how many it frees. */
interface Suggestion {
    kind: "fewer" | "trim"
    voices: number
}

/**
 * The ways region `index` could free voices, for a problem of kind `problem`. Voices freed are counted from those it
 * gets, where sound effects take the last voices, or from those it needs, where the regions need more than the game
 * has. A region the encoder hasn't chosen voices for gets as many as it needs once it's edited.
 */
function suggestionsFor(report: VoiceReport, index: number, problem: "short" | "shared"): Suggestion[] {
    const needs = report.voices.needed[index]
    const holds = problem === "short" ? needs : report.voices.given[index]
    const suggestions: Suggestion[] = []
    if (needs > 1) {
        suggestions.push({ kind: "fewer", voices: holds - (needs - 1) })
    }
    const freedByTrimming = report.tracks[index].voices_freed_by_trimming
    if (freedByTrimming > 0) {
        suggestions.push({ kind: "trim", voices: holds - (needs - freedByTrimming) })
    }
    return suggestions.filter(suggestion => suggestion.voices > 0)
}

/**
 * What's wrong with an open region's voices, if anything, and how the regions that could free voices would fix it, by
 * playing fewer notes at once or trimming short overlaps. A region short of voices gets them back when any region frees
 * them, and a region on voices sound effects share leaves them when it or the regions before it free them, as the game
 * gives tracks their voices in order.
 */
export function VoiceNote({ trackListId, trackIndex, segmentIndex, segmentStart }: {
    trackListId: number
    trackIndex: number
    segmentIndex: number
    /** Where the region starts along the variation, in ticks. */
    segmentStart: number
}) {
    const [bgm] = useBgm()
    const report = useVoiceReport(trackListId)
    const trackList = bgm?.track_lists[trackListId]
    const track = trackList?.tracks[trackIndex]
    if (!report || !trackList || !track) {
        return null
    }
    const { voices } = report
    // Alternate parts play on the voices of the tracks they're for
    const index = track.alternate_for ?? trackIndex
    const problem = voiceProblem(trackList, voices, index)
    if (!problem) {
        return null
    }
    const isShort = problem === "short"
    const toFree = isShort ? voices.needed[index] - voices.given[index] : sharedCount(voices, index)
    const candidates = trackList.tracks
        .map((_, candidate) => candidate)
        .filter(candidate => candidate !== 0 && trackList.tracks[candidate].alternate_for == null &&
            (isShort || candidate <= index))
        .map(candidate => ({ candidate, suggestions: suggestionsFor(report, candidate, problem) }))
        .filter(({ suggestions }) => suggestions.length > 0)

    return <section className={classNames(styles.voices, isShort ? styles.short : styles.shared)}>
        <div className={styles.heading}>
            <span>Voices</span>
            <ContextualHelp variant="info">
                <Heading>Voices</Heading>
                <Content>
                    <p>
                        The game plays each note on a voice. Music has {MAX_VOICES}, and sound effects take the last
                        {" "}{MAX_VOICES - MUSIC_VOICES} whenever they play, cutting short the notes playing on them.
                    </p>
                    <p>
                        Each region holds a voice for every note it plays at once at its busiest, up to 4, for as long
                        as its section plays. Tracks take their voices in order, so the tracks lower down get the
                        voices sound effects share.
                    </p>
                    <p>
                        When a section&apos;s regions need more than {MAX_VOICES}, some get fewer than they need, and
                        cut their own notes short.
                    </p>
                </Content>
            </ContextualHelp>
        </div>
        <p className={styles.message}>
            {isShort
                ? `This region gets ${voices.given[index]} of the ${voices.needed[index]} voices it needs, so some of its notes are cut short.`
                : "Sound effects may cut notes short in this region."}
            {candidates.length > 0 && (isShort
                ? ` To fix this, free ${plural(toFree, "voice")} in any region in this section:`
                : ` To avoid this, free ${plural(toFree, "voice")} in this region or any above it:`)}
        </p>
        {candidates.length > 0 && <div className={styles.candidates}>
            {candidates.map(({ candidate, suggestions }) => <Candidate
                key={candidate}
                report={report}
                suggestions={suggestions}
                trackListId={trackListId}
                trackIndex={candidate}
                isOpen={candidate === index}
                segmentIndex={segmentIndex}
                segmentStart={segmentStart}
            />)}
        </div>}
    </section>
}

/** A region that could free voices, with how, and buttons to show where or to do it. */
function Candidate({ report, suggestions, trackListId, trackIndex, isOpen, segmentIndex, segmentStart }: {
    report: VoiceReport
    suggestions: Suggestion[]
    trackListId: number
    trackIndex: number
    /** Whether it's the open region, which is called "This region". */
    isOpen: boolean
    segmentIndex: number
    segmentStart: number
}) {
    const [bgm, dispatch] = useBgm()
    const [root, rootDispatch] = useRoot()
    const [location] = useLocation()
    const time = useTime()
    const playhead = useContext(PLAYHEAD_CONTEXT)
    const track = bgm?.track_lists[trackListId]?.tracks[trackIndex]
    const instrumentName = useInstrumentName(track?.commands, !!(track && bgm && playsDrums(bgm, track, location.mix)), trackIndex, segmentIndex)
    if (!track) {
        return null
    }
    const use = report.tracks[trackIndex]
    const needs = report.voices.needed[trackIndex]

    // Opens the region with the notes where it plays the most at once selected, and goes to the first of them
    const show = () => {
        const id = root.activeDocId
        if (!id) return
        startTransition(() => {
            rootDispatch(
                { type: "doc", id, action: { type: "set_panel_content", panelContent: { type: "tracker", trackList: trackListId, track: trackIndex, segment: segmentIndex } } },
                { type: "doc", id, action: { type: "set_location", location: { alternateParts: false } } },
                { type: "doc", id, action: { type: "set_selection", selection: { trackList: trackListId, track: trackIndex, events: use.busiest_notes } } },
            )
        })
        if (use.busiest_at == null) return
        const ticks = segmentStart + use.busiest_at
        if (playhead?.playing) {
            // The timelines follow the song as it plays, so play from there, as clicking the ruler does
            playhead.play(ticks)
        } else {
            // The transition renders the region a frame later, and it's laid out the frame after
            requestAnimationFrame(() => requestAnimationFrame(() => time.scrollToTicks(ticks)))
        }
    }

    return <div className={styles.candidate}>
        <div className={styles.candidateName}>{isOpen ? "This region" : track.name || instrumentName || `Track ${trackIndex}`}</div>
        {suggestions.map(suggestion => <div key={suggestion.kind} className={styles.suggestion}>
            <span>
                {suggestion.kind === "fewer"
                    ? `Play at most ${needs - 1} at once`
                    : `Trim ${plural(use.short_overlaps.length, "short overlap")}`}
                {" "}to free {plural(suggestion.voices, "voice")}
            </span>
            {suggestion.kind === "fewer"
                ? <button className={styles.action} onClick={show}>Show where</button>
                : <button
                    className={styles.action}
                    onClick={() => dispatch({ type: "trim_short_overlaps", trackList: trackListId, tracks: [trackIndex] })}
                >
                    Trim
                </button>}
        </div>)}
    </div>
}
