import { ActionButton, Item, Menu, MenuTrigger } from "@adobe/react-spectrum"
import { Event } from "pm64-typegen"
import { useMemo, useState } from "react"

import AutomationLane from "./AutomationLane"
import styles from "./AutomationLane.module.scss"
import CommandMarkers from "./CommandMarkers"
import { commandName, isShown, LaneKind, lanePoints, timeline, trackLanes } from "./lanes"
import useLaneEditing from "./useLaneEditing"

import { useBgm } from "../store"

const EVENTS_LANE = "events"

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
 * Lanes under the piano roll for a track's commands other than notes, a lane for any others, and a menu to show more
 * lanes.
 */
export default function TrackLanes({ trackListId, trackIndex, length }: { trackListId: number, trackIndex: number, length: number }) {
    const [bgm, dispatch] = useBgm()
    const commands = bgm?.track_lists[trackListId]?.tracks[trackIndex]?.commands
    const played = useMemo(() => timeline(commands ?? []), [commands])
    const [addedLanes, setAddedLanes] = useState<string[]>([])
    const [adding, setAdding] = useState<number | null>(null)
    const kinds = useMemo(() => (bgm ? trackLanes(bgm) : []), [bgm])

    const events = played.filter(({ event }) => isEvent(event))
    const others = played.filter(({ event }) => !isEvent(event) && !isShown(event, kinds))
    const shownLanes = kinds.filter(kind => addedLanes.includes(kind.key) || lanePoints(kind, played).length > 0)
    const showEvents = events.length > 0 || addedLanes.includes(EVENTS_LANE)
    const hiddenLanes = [
        ...kinds.filter(kind => !shownLanes.includes(kind)).map(kind => ({ key: kind.key, name: kind.name })),
        ...(showEvents ? [] : [{ key: EVENTS_LANE, name: "Events" }]),
    ]

    const add = (command: object) => {
        if (adding !== null) {
            dispatch({ type: "insert_track_command", trackList: trackListId, track: trackIndex, time: adding, command: command as never })
        }
        setAdding(null)
    }

    return <div>
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
        {hiddenLanes.length > 0 && <MenuTrigger>
            <ActionButton isQuiet aria-label="Show another lane">+ Lane</ActionButton>
            <Menu onAction={key => setAddedLanes([...addedLanes, String(key)])} items={hiddenLanes}>
                {item => <Item key={item.key}>{item.name}</Item>}
            </Menu>
        </MenuTrigger>}
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
