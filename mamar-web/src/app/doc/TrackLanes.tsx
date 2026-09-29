import { Item, Picker, Section } from "@adobe/react-spectrum"
import { Event } from "pm64-typegen"
import { useMemo, useState } from "react"

import AutomationLane from "./AutomationLane"
import styles from "./AutomationLane.module.scss"
import CommandMarkers from "./CommandMarkers"
import { LaneOption } from "./LaneMenu"
import { commandName, inLane, LaneKind, lanePoints, startingEvents, timeline, trackLanes } from "./lanes"
import { TICKS_PER_BEAT, useTicksPerBar } from "./Ruler"
import { useCarriedValues } from "./segmentTracks"
import laneStyles from "./TrackLanes.module.scss"
import useLaneEditing from "./useLaneEditing"
import VelocityLane from "./VelocityLane"

import { useBgm, useDoc } from "../store"

const EVENTS_LANE = "events"
const VELOCITY_LANE = "velocity"
const OTHER_LANE = "other"

function isEvent(event: Event): boolean {
    return "EventTrigger" in event || "TriggerSound" in event
}

function eventLabel(event: Event): string {
    if ("EventTrigger" in event) {
        return `Music event 0x${event.EventTrigger.event_info.toString(16).padStart(6, "0")}`
    } else if ("TriggerSound" in event) {
        return `Sound effect ${event.TriggerSound.sound}`
    }
    return commandName(event)
}

/**
 * The lanes a track can show, and its commands with the time each plays at, apart from those that set its starting
 * values, which lanes don't show.
 */
function useTrackLanes(trackListId: number, trackIndex: number) {
    const [bgm] = useBgm()
    const commands = bgm?.track_lists[trackListId]?.tracks[trackIndex]?.commands
    const kinds = useMemo(() => (bgm ? trackLanes(bgm) : []), [bgm])
    const { played, starting } = useMemo(() => {
        const all = timeline(commands ?? [])
        const starting = startingEvents(kinds, all)
        return { played: all.filter(played => !starting.includes(played)), starting }
    }, [commands, kinds])
    const events = played.filter(({ event }) => isEvent(event))
    const options: LaneOption[] = [
        { key: VELOCITY_LANE, name: "Velocity", hasCommands: played.some(({ event }) => "Note" in event) },
        ...kinds.map(kind => ({ key: kind.key, name: kind.name, hasCommands: lanePoints(kind, played).length > 0 })),
        { key: EVENTS_LANE, name: "Events", hasCommands: events.length > 0 },
    ]
    return { played, starting, kinds, events, options }
}

/** What to do in a lane that has nothing in it yet. */
function emptyHint(lane: LaneOption): string {
    switch (lane.key) {
    case VELOCITY_LANE:
        return "Add notes to the piano roll to change how hard they play here"
    case EVENTS_LANE:
        return "Click to add a music event or sound effect"
    default:
        return `Click to add a ${lane.name.toLowerCase()} change`
    }
}

/** How tall the lane under the piano roll is, whichever lane it shows. */
const LANE_HEIGHT = 64

/**
 * One lane under the piano roll for a track's commands other than notes, as in Logic's automation view. A menu
 * above it chooses the lane, listing the lanes the track uses first.
 */
export default function TrackLanes({ trackListId, trackIndex, mainIndex, segmentIndex, length, isGreyed = false }: {
    trackListId: number
    trackIndex: number
    /** The track, or the track that its alternate part is for, and the segment, whose earlier segments carry values. */
    mainIndex: number
    segmentIndex: number
    length: number
    /** Whether the lane is only shown beside the segment being edited, so it has no menu. */
    isGreyed?: boolean
}) {
    const [, dispatch] = useBgm()
    const [doc, docDispatch] = useDoc()
    const { played, starting, kinds, events, options } = useTrackLanes(trackListId, trackIndex)
    const [adding, setAdding] = useState<number | null>(null)
    const carried = useCarriedValues(mainIndex, segmentIndex)
    const ticksPerBar = useTicksPerBar()

    // Commands no lane is for
    const others = played.filter(({ event }) => !isEvent(event) && !inLane(event, kinds))
    const choices = others.length > 0 ? [...options, { key: OTHER_LANE, name: "Other", hasCommands: true }] : options
    const chosen = choices.find(option => option.key === doc?.trackLanes?.[trackIndex]) ?? choices[0]
    const used = choices.filter(option => option.hasCommands)
    const unused = choices.filter(option => !option.hasCommands)
    const kind = kinds.find(kind => kind.key === chosen.key)

    const add = (command: object) => {
        if (adding !== null) {
            dispatch({ type: "insert_track_command", trackList: trackListId, track: trackIndex, time: adding, command: command as never })
        }
        setAdding(null)
    }

    return <div className={laneStyles.trackLanes}>
        <div className={laneStyles.header}>
            {!isGreyed && <div className={laneStyles.menu}>
                <Picker
                    aria-label="Lane"
                    isQuiet
                    selectedKey={chosen.key}
                    onSelectionChange={key => docDispatch({ type: "set_track_lane", track: trackIndex, lane: String(key) })}
                >
                    {[
                        ...(used.length > 0 ? [<Section key="used" title="In this track">
                            {used.map(option => <Item key={option.key}>{option.name}</Item>)}
                        </Section>] : []),
                        ...(unused.length > 0 ? [<Section key="unused" title="Not used yet">
                            {unused.map(option => <Item key={option.key}>{option.name}</Item>)}
                        </Section>] : []),
                    ]}
                </Picker>
            </div>}
        </div>
        <div
            className={laneStyles.body}
            style={{
                "height": LANE_HEIGHT,
                "--ticks-per-beat": `${TICKS_PER_BEAT}px`,
                "--beats-per-bar": ticksPerBar / TICKS_PER_BEAT,
            } as React.CSSProperties}
        >
            {!chosen.hasCommands && !isGreyed && <span className={laneStyles.hint}>{emptyHint(chosen)}</span>}
            {chosen.key === VELOCITY_LANE && <VelocityLane trackListId={trackListId} trackIndex={trackIndex} length={length} played={played} />}
            {kind && <TrackLane
                kind={kind}
                trackListId={trackListId}
                trackIndex={trackIndex}
                length={length}
                played={played}
                initial={lanePoints(kind, starting)[0]?.value ?? carried.values.find(value => value.kind.key === kind.key)?.value}
            />}
            {chosen.key === EVENTS_LANE && <CommandMarkers
                name="Events"
                showName={false}
                trackListId={trackListId}
                trackIndex={trackIndex}
                length={length}
                events={events}
                label={eventLabel}
                onAddAt={setAdding}
            >
                {adding !== null && <span
                    className={styles.chooser}
                    style={{ left: `${(adding / length) * 100}%` }}
                    onPointerDown={e => e.stopPropagation()}
                >
                    <button onClick={() => add({ EventTrigger: { event_info: 0 } })}>Add music event</button>
                    <button onClick={() => add({ TriggerSound: { sound: 0 } })}>Play sound effect</button>
                    <button onClick={() => setAdding(null)}>Cancel</button>
                </span>}
            </CommandMarkers>}
            {chosen.key === OTHER_LANE && <CommandMarkers
                name="Other"
                showName={false}
                trackListId={trackListId}
                trackIndex={trackIndex}
                length={length}
                events={others}
                label={commandName}
            />}
        </div>
    </div>
}

function TrackLane({ kind, trackListId, trackIndex, length, played, initial }: {
    kind: LaneKind
    trackListId: number
    trackIndex: number
    length: number
    played: { time: number, event: Event }[]
    /** The track's starting value for the lane. */
    initial?: number
}) {
    const editing = useLaneEditing(trackListId, trackIndex, kind)
    return <AutomationLane kind={kind} length={length} points={lanePoints(kind, played)} initial={initial} showName={false} {...editing} />
}
