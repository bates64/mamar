import { ActionButton, Item, Menu, MenuTrigger } from "@adobe/react-spectrum"
import { Event, TrackList } from "pm64-typegen"
import { useMemo, useRef, useState } from "react"

import AutomationLane from "./AutomationLane"
import CommandMarkers from "./CommandMarkers"
import { commandName, isShown, LaneKind, lanePoints, lastValue, MASTER_LANES, MASTER_VOLUME_LANE, TEMPO_LANE, timeline, TRANSPOSE_LANE } from "./lanes"
import { PlayheadLine } from "./Playhead"
import { useSegmentLengths, useTicksPerBar } from "./Ruler"
import { useSnap } from "./snap"
import styles from "./SongLanes.module.scss"
import TimeGrid from "./TimeGrid"
import useLaneEditing from "./useLaneEditing"

import { useBgm, useVariation } from "../store"
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
    const [addedLanes, setAddedLanes] = useState<string[]>([])

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

    // Effects that never change are the song's settings, so only lanes whose value changes are shown
    const shownMasterLanes = MASTER_LANES.filter(kind => {
        const values = new Set(pointsOf(kind).map(point => point.value))
        return kind === MASTER_VOLUME_LANE || values.size > 1 || addedLanes.includes(kind.key)
    })
    const hiddenMasterLanes = MASTER_LANES.filter(kind => !shownMasterLanes.includes(kind))

    const row = (kind: LaneKind, className: string, label: React.ReactNode = kind.name) => <div key={kind.key} className={`${styles.row} ${className}`}>
        <div className={styles.label}>{label}</div>
        <TimeGrid>
            {segments.map((segment, i) => {
                if (!segment.trackList || segment.trackListId === undefined) {
                    return <div key={segment.key} />
                }
                const initial = lastValue(masterTimelines.slice(0, i).flatMap(commands => lanePoints(kind, commands)))
                return <SegmentLane
                    key={segment.key}
                    kind={kind}
                    segment={segment as SegmentTrack}
                    commands={masterTimelines[i]}
                    length={segmentLengths[i]}
                    initial={initial}
                />
            })}
            <PlayheadLine />
        </TimeGrid>
    </div>

    return <div className={styles.lanes}>
        <div className={`${styles.row} ${styles.ruler}`}>
            <div className={styles.label}>Segments</div>
            <TimeGrid>
                {segments.map((segment, i) => (segment.trackListId === undefined
                    ? <div key={segment.key} />
                    : <SegmentLength key={segment.key} trackListId={segment.trackListId} length={segmentLengths[i]} />))}
                <PlayheadLine />
            </TimeGrid>
        </div>
        {row(TEMPO_LANE, styles.ruler)}
        {row(TRANSPOSE_LANE, styles.ruler)}
        {shownMasterLanes.map((kind, i) => row(kind, styles.master, <>
            {i === 0 && <strong>Master</strong>}
            <span>{kind.name}</span>
            {i === 0 && hiddenMasterLanes.length > 0 && <MenuTrigger>
                <ActionButton isQuiet aria-label="Show another master lane">+ Lane</ActionButton>
                <Menu onAction={key => setAddedLanes([...addedLanes, String(key)])}>
                    {hiddenMasterLanes.map(kind => <Item key={kind.key}>{kind.name}</Item>)}
                </Menu>
            </MenuTrigger>}
        </>))}
        {masterTimelines.some(commands => commands.some(({ event }) => !isShown(event, SONG_LANES))) && <div className={`${styles.row} ${styles.master}`}>
            <div className={styles.label}><span>Other</span></div>
            <TimeGrid>
                {segments.map((segment, i) => (segment.trackListId === undefined
                    ? <div key={segment.key} />
                    : <CommandMarkers
                        key={segment.key}
                        name=""
                        trackListId={segment.trackListId}
                        trackIndex={0}
                        length={segmentLengths[i]}
                        events={masterTimelines[i].filter(({ event }) => !isShown(event, SONG_LANES))}
                        label={commandName}
                    />))}
                <PlayheadLine />
            </TimeGrid>
        </div>}
    </div>
}

/** A segment's length, with a handle on its end to drag it longer or shorter. */
function SegmentLength({ trackListId, length }: { trackListId: number, length: number }) {
    const [, dispatch] = useBgm()
    const [, snap] = useSnap()
    const ticksPerBar = useTicksPerBar()
    const ref = useRef<HTMLDivElement>(null)
    const [drag, setDrag] = useState<{ startX: number, length: number } | null>(null)
    const bars = (ticks: number) => `${+(ticks / ticksPerBar).toFixed(2)} bars`

    return <div ref={ref} className={styles.segment}>
        <span>{bars(drag?.length ?? length)}</span>
        <span
            className={styles.resize}
            title="Drag to change the segment's length. Hold Shift to place freely."
            data-no-drag-scroll
            onPointerDown={event => {
                event.stopPropagation()
                event.currentTarget.setPointerCapture(event.pointerId)
                setDrag({ startX: event.clientX, length })
            }}
            onPointerMove={event => {
                if (!drag) return
                const ticksPerPx = length / ref.current!.getBoundingClientRect().width
                const newLength = snap(length + (event.clientX - drag.startX) * ticksPerPx, event.shiftKey)
                setDrag({ ...drag, length: Math.max(1, newLength) })
            }}
            onPointerUp={() => {
                if (drag && drag.length !== length) {
                    dispatch({ type: "set_segment_length", trackList: trackListId, length: drag.length })
                }
                setDrag(null)
            }}
        />
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
