import { Event } from "pm64-typegen"
import { useMemo, useState } from "react"

import AutomationLane from "./AutomationLane"
import styles from "./AutomationLane.module.scss"
import CommandMarkers from "./CommandMarkers"
import { LaneOption, useLaneShown } from "./LaneMenu"
import { commandName, inLane, LaneKind, lanePoints, timeline, trackLanes } from "./lanes"
import useLaneEditing from "./useLaneEditing"
import VelocityLane from "./VelocityLane"

import { useBgm } from "../store"

const EVENTS_LANE = "events"
const VELOCITY_LANE = "velocity"

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

/** The lanes a track can show, and its commands with the time each plays at. */
export function useTrackLanes(trackListId: number, trackIndex: number) {
    const [bgm] = useBgm()
    const commands = bgm?.track_lists[trackListId]?.tracks[trackIndex]?.commands
    const played = useMemo(() => timeline(commands ?? []), [commands])
    const kinds = useMemo(() => (bgm ? trackLanes(bgm) : []), [bgm])
    const events = played.filter(({ event }) => isEvent(event))
    const options: LaneOption[] = [
        { key: VELOCITY_LANE, name: "Velocity", hasCommands: played.some(({ event }) => "Note" in event) },
        ...kinds.map(kind => ({ key: kind.key, name: kind.name, hasCommands: lanePoints(kind, played).length > 0 })),
        { key: EVENTS_LANE, name: "Events", hasCommands: events.length > 0 },
    ]
    return { played, kinds, events, options }
}

/** Lanes under the piano roll for a track's commands other than notes, and a lane for any others. */
export default function TrackLanes({ trackListId, trackIndex, length }: { trackListId: number, trackIndex: number, length: number }) {
    const [, dispatch] = useBgm()
    const { played, kinds, events, options } = useTrackLanes(trackListId, trackIndex)
    const isShown = useLaneShown()
    const [adding, setAdding] = useState<number | null>(null)

    // Commands no lane is for, whether or not the lane is shown
    const others = played.filter(({ event }) => !isEvent(event) && !inLane(event, kinds))
    const option = (key: string) => options.find(o => o.key === key)!
    const shownLanes = kinds.filter(kind => isShown(option(kind.key)))
    const showVelocity = isShown(option(VELOCITY_LANE))
    const showEvents = isShown(option(EVENTS_LANE))

    const add = (command: object) => {
        if (adding !== null) {
            dispatch({ type: "insert_track_command", trackList: trackListId, track: trackIndex, time: adding, command: command as never })
        }
        setAdding(null)
    }

    return <div>
        {showVelocity && <div style={{ height: 50 }}>
            <VelocityLane trackListId={trackListId} trackIndex={trackIndex} length={length} played={played} />
        </div>}
        {shownLanes.map(kind => <div key={kind.key} style={{ height: kind.display === "line" ? 44 : 30 }}>
            <TrackLane kind={kind} trackListId={trackListId} trackIndex={trackIndex} length={length} played={played} />
        </div>)}
        {showEvents && <div style={{ height: 30 }}>
            <CommandMarkers
                name="Events"
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
            </CommandMarkers>
        </div>}
        {others.length > 0 && <div style={{ height: 30 }}>
            <CommandMarkers
                name="Other"
                trackListId={trackListId}
                trackIndex={trackIndex}
                length={length}
                events={others}
                label={commandName}
            />
        </div>}
    </div>
}

function TrackLane({ kind, trackListId, trackIndex, length, played }: {
    kind: LaneKind
    trackListId: number
    trackIndex: number
    length: number
    played: { time: number, event: Event }[]
}) {
    const editing = useLaneEditing(trackListId, trackIndex, kind)
    return <AutomationLane kind={kind} length={length} points={lanePoints(kind, played)} {...editing} />
}
