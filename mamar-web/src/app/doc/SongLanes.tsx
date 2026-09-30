import { Event, TrackList } from "pm64-typegen"
import { useMemo } from "react"

import AutomationLane from "./AutomationLane"
import CommandMarkers from "./CommandMarkers"
import Inspector from "./Inspector"
import LaneMenu, { useLaneShown } from "./LaneMenu"
import { commandName, inLane, LaneKind, lanePoints, lastValue, MASTER_LANES, MASTER_VOLUME_LANE, TEMPO_LANE, timeline, TRANSPOSE_LANE } from "./lanes"
import { PlayheadLine } from "./Playhead"
import { usePickup, useSegmentLengths, useTicksPerBar } from "./Ruler"
import { SegmentStart } from "./snap"
import styles from "./SongLanes.module.scss"
import TimeGrid from "./TimeGrid"
import useLaneEditing from "./useLaneEditing"

import { useBgm, useDoc, useVariation } from "../store"
import { getSegmentId } from "../store/segment"

/** Every lane of the master track's commands. */
const SONG_LANES = [TEMPO_LANE, TRANSPOSE_LANE, ...MASTER_LANES]

interface SegmentTrack {
    key: string | number
    trackListId: number
    trackList: TrackList
}

/** The master track's commands, which are song-wide, as lanes across the variation. */
export default function SongLanes() {
    const [bgm] = useBgm()
    const [variation] = useVariation()
    const segmentLengths = useSegmentLengths()
    const segmentStarts = segmentLengths.map((_, i) => segmentLengths.slice(0, i).reduce((sum, length) => sum + length, 0))
    const ticksPerBar = useTicksPerBar()
    const pickup = usePickup()
    const isShown = useLaneShown()
    const [doc] = useDoc()
    const selection = doc?.selection

    const segments = useMemo(() => (variation?.segments ?? []).map((segment, i) => {
        const key = getSegmentId(segment) ?? i
        if (bgm && "Subseg" in segment) {
            const trackList = bgm.track_lists[segment.Subseg.track_list]
            return { key, trackListId: segment.Subseg.track_list, trackList }
        }
        return { key, trackListId: undefined, trackList: undefined }
    }), [bgm, variation])

    const masterTimelines = useMemo(
        () => segments.map(segment => (segment.trackList ? timeline(segment.trackList.tracks[0].commands) : [])),
        [segments],
    )

    if (!bgm || !variation) {
        return null
    }

    const pointsOf = (kind: LaneKind) => masterTimelines.flatMap(commands => lanePoints(kind, commands))

    // Effects that never change are the song's settings, so only effect lanes whose value changes are shown by default
    const laneOptions = SONG_LANES.map(kind => ({
        key: kind.key,
        name: kind.name,
        hasCommands: MASTER_LANES.includes(kind) && kind !== MASTER_VOLUME_LANE
            ? new Set(pointsOf(kind).map(point => point.value)).size > 1
            : kind === MASTER_VOLUME_LANE || pointsOf(kind).length > 0,
    }))
    const shownLanes = SONG_LANES.filter((_, i) => isShown(laneOptions[i]))
    // A line at each bar, which starts after the pickup, as the ruler's bars do
    const barLines = { "--bar": `${ticksPerBar}px`, "--pickup": `${pickup}px` } as React.CSSProperties

    const row = (kind: LaneKind, className: string, label: React.ReactNode = kind.name) => <div key={kind.key} className={`${styles.row} ${className}`}>
        <div className={styles.label}>{label}</div>
        {pointsOf(kind).length === 0 && <span className={styles.hint}>Click to add a {kind.name.toLowerCase()} change</span>}
        <TimeGrid className={styles.bars} style={barLines}>
            {segments.map((segment, i) => {
                if (!segment.trackList || segment.trackListId === undefined) {
                    return <div key={segment.key} />
                }
                const initial = lastValue(masterTimelines.slice(0, i).flatMap(commands => lanePoints(kind, commands)))
                return <SegmentStart.Provider key={segment.key} value={segmentStarts[i]}>
                    <SegmentLane
                        kind={kind}
                        segment={segment as SegmentTrack}
                        commands={masterTimelines[i]}
                        length={segmentLengths[i]}
                        initial={initial}
                    />
                </SegmentStart.Provider>
            })}
            <PlayheadLine />
        </TimeGrid>
    </div>

    return <div className={styles.lanes}>
        <div className={`${styles.row} ${styles.masterHeading}`}>
            <div className={styles.label}>
                <LaneMenu name="Song lanes" lanes={laneOptions} />
            </div>
            <div />
        </div>
        {selection?.track === 0 && segments.some(segment => segment.trackListId === selection.trackList) && <div className={styles.inspector}>
            <Inspector trackListId={selection.trackList} trackIndex={0} />
        </div>}
        {shownLanes.map(kind => row(kind, styles.master))}
        {masterTimelines.some(commands => commands.some(({ event }) => !inLane(event, SONG_LANES))) && <div className={`${styles.row} ${styles.master}`}>
            <div className={styles.label}><span>Other</span></div>
            <TimeGrid className={styles.bars} style={barLines}>
                {segments.map((segment, i) => (segment.trackListId === undefined
                    ? <div key={segment.key} />
                    : <SegmentStart.Provider key={segment.key} value={segmentStarts[i]}>
                        <CommandMarkers
                            name=""
                            trackListId={segment.trackListId}
                            trackIndex={0}
                            length={segmentLengths[i]}
                            events={masterTimelines[i].filter(({ event }) => !inLane(event, SONG_LANES))}
                            label={commandName}
                        />
                    </SegmentStart.Provider>))}
                <PlayheadLine />
            </TimeGrid>
        </div>}
    </div>
}

function SegmentLane({ kind, segment, commands, length, initial }: {
    kind: LaneKind
    segment: SegmentTrack
    commands: { time: number, event: Event }[]
    length: number
    initial: number | undefined
}) {
    const editing = useLaneEditing(segment.trackListId, 0, kind)
    return <AutomationLane
        kind={kind}
        length={length}
        points={lanePoints(kind, commands)}
        initial={initial}
        showName={false}
        {...editing}
    />
}
