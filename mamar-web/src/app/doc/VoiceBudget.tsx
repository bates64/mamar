import { startTransition, useRef, useState } from "react"
import { AlertTriangle } from "react-feather"

import FixedPopover from "./FixedPopover"
import { TICKS_PER_BEAT, usePickup, useTicksPerBar } from "./Ruler"
import styles from "./VoiceBudget.module.scss"
import { MAX_VOICES, total, useVoiceReport } from "./voices"

import { useBgm, useRoot } from "../store"

/** Where `ticks` along the variation falls, as bar and beat, counting the pickup as bar 0, as the playhead shows it. */
function barAndBeat(ticks: number, pickup: number, ticksPerBar: number): string {
    const sinceBar1 = ticks - pickup
    const bar = Math.floor(sinceBar1 / ticksPerBar)
    const beat = Math.floor((sinceBar1 - bar * ticksPerBar) / TICKS_PER_BEAT)
    return `${bar + 1}.${beat + 1}`
}

/**
 * The voices the regions of a part of the song need, shown under them only when that's more than the game has, which
 * cuts notes off. Pressing it lists each track's voices and where it needs them most, with a button to trim the short
 * overlaps that make a track need a voice more.
 */
export default function VoiceBudget({ trackListId, segmentIndex, segmentStart }: {
    trackListId: number
    segmentIndex: number
    /** Where the regions start along the variation, in ticks. */
    segmentStart: number
}) {
    const [bgm, dispatch] = useBgm()
    const [root, rootDispatch] = useRoot()
    const report = useVoiceReport(trackListId)
    const pickup = usePickup()
    const ticksPerBar = useTicksPerBar()
    const badge = useRef<HTMLButtonElement>(null)
    const [anchor, setAnchor] = useState<DOMRect | null>(null)

    const trackList = bgm?.track_lists[trackListId]
    if (!report || !trackList) {
        return null
    }
    const needed = total(report.voices.needed)
    const isOver = needed > MAX_VOICES
    // Trimming can bring the regions within budget while the list is open, which then says so
    if (!isOver && !anchor) {
        return null
    }

    const rows = trackList.tracks
        .map((track, index) => ({
            index,
            name: track.name || `Track ${index}`,
            needs: report.voices.needed[index],
            gets: report.voices.given[index],
            use: report.tracks[index],
        }))
        // Alternate parts use the voices of the tracks they're for, which count them
        .filter(row => row.index !== 0 && row.needs > 0 && trackList.tracks[row.index].alternate_for == null)
        // The tracks most likely to give up a voice cheaply first
        .sort((a, b) => Number(b.use.short_overlaps.length > 0) - Number(a.use.short_overlaps.length > 0) || b.needs - a.needs)
    const trimmable = rows.filter(row => row.use.short_overlaps.length > 0)

    const trim = (tracks: number[]) => dispatch({ type: "trim_short_overlaps", trackList: trackListId, tracks })

    // Opens the track's region where it plays the most notes at once, with those notes selected
    const open = (index: number, busiestAt: number | null | undefined, notes: number[]) => {
        const id = root.activeDocId
        if (!id) return
        setAnchor(null)
        startTransition(() => {
            rootDispatch(
                { type: "doc", id, action: { type: "set_panel_content", panelContent: { type: "tracker", trackList: trackListId, track: index, segment: segmentIndex } } },
                { type: "doc", id, action: { type: "set_location", location: { alternateParts: false } } },
                { type: "doc", id, action: { type: "set_selection", selection: { trackList: trackListId, track: index, events: notes } } },
            )
        })
        if (busiestAt == null) return
        // Once the region is open, scroll every timeline to it, as the playhead does when it follows the song
        const provider = badge.current?.closest("[data-time-provider]")
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const grids = provider?.querySelectorAll<HTMLElement>("[data-time-grid]") ?? []
            for (const grid of grids) {
                const zoom = parseFloat(getComputedStyle(grid).getPropertyValue("--ruler-zoom")) || 2
                grid.scrollLeft = Math.max(0, (segmentStart + busiestAt) / zoom - grid.clientWidth / 3)
            }
        }))
    }

    return <>
        <button
            ref={badge}
            className={styles.badge}
            data-no-drag-scroll
            onClick={event => {
                event.stopPropagation()
                setAnchor(anchor ? null : event.currentTarget.getBoundingClientRect())
            }}
        >
            <AlertTriangle size={14} aria-hidden />
            {needed} / {MAX_VOICES} voices
        </button>
        {anchor && <FixedPopover anchor={anchor} onClose={() => setAnchor(null)}>
            <div className={styles.budget}>
                <div className={styles.heading}>
                    {isOver ? `${needed} / ${MAX_VOICES} voices` : `${needed} / ${MAX_VOICES} voices: now within the budget`}
                </div>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Track</th>
                            <th>Needs</th>
                            <th>Gets</th>
                            <th>Busiest at</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(row => <tr
                            key={row.index}
                            className={styles.row}
                            tabIndex={0}
                            title="Open this region where it plays the most notes at once"
                            onClick={() => open(row.index, row.use.busiest_at, row.use.busiest_notes)}
                            onKeyDown={event => {
                                if (event.key === "Enter") open(row.index, row.use.busiest_at, row.use.busiest_notes)
                            }}
                        >
                            <td>{row.name}</td>
                            <td>{row.needs}</td>
                            <td className={row.gets < row.needs ? styles.short : undefined}>{row.gets}</td>
                            <td>{row.use.busiest_at != null ? `bar ${barAndBeat(segmentStart + row.use.busiest_at, pickup, ticksPerBar)}` : ""}</td>
                            <td>
                                {row.use.short_overlaps.length > 0 && <span className={styles.overlaps}>
                                    {row.use.short_overlaps.length} short {row.use.short_overlaps.length === 1 ? "overlap" : "overlaps"}
                                    <button
                                        className={styles.trim}
                                        title="Shorten each note held a little into the next, so it ends as the next starts"
                                        onClick={event => {
                                            event.stopPropagation()
                                            trim([row.index])
                                        }}
                                    >Trim</button>
                                </span>}
                            </td>
                        </tr>)}
                    </tbody>
                </table>
                {trimmable.length > 1 && <button className={styles.trimAll} onClick={() => trim(trimmable.map(row => row.index))}>
                    Trim all short overlaps
                </button>}
                <p className={styles.explanation}>
                    Each track reserves a voice for every note it plays at once at its busiest point, up to 4, for as
                    long as these regions play. The game has {MAX_VOICES}, so tracks that get fewer than they need cut
                    notes off.
                </p>
            </div>
        </FixedPopover>}
    </>
}
