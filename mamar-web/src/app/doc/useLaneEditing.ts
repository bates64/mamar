import { Command, Event } from "pm64-typegen"

import { Props as LaneProps } from "./AutomationLane"
import { LaneKind, lanePoints, LanePoint, timeline } from "./lanes"
import { useMixCommands } from "./segmentTracks"

import { useBgm, useDoc } from "../store"
import { useSelectedIds } from "../store/doc"

/** `command` as an event with ID `id`. Commands without fields, like "End", are keys whose value is null in events. */
export function toEvent(command: Command, id: number): Event {
    return (typeof command === "string" ? { [command]: null, id } : { ...command, id }) as unknown as Event
}

/** Edits the commands of `kind` in track `trackIndex` of track list `trackListId` through a lane. */
export default function useLaneEditing(
    trackListId: number,
    trackIndex: number,
    kind: LaneKind,
): Pick<LaneProps, "onAdd" | "onChange" | "onMove" | "onDelete" | "onToggleFade" | "onSelect" | "selectedIds"> {
    const [bgm, dispatch] = useBgm()
    const [, docDispatch] = useDoc()
    const selectedIds = useSelectedIds(trackListId, trackIndex)
    const commands = useMixCommands(bgm?.track_lists[trackListId]?.tracks[trackIndex]?.commands) ?? []
    const target = { trackList: trackListId, track: trackIndex }
    const commandOf = (point: LanePoint, value: number) => {
        const current = point.event as unknown as Record<string, unknown>
        if (point.fade !== undefined && kind.fade) {
            return kind.fade(value, point.fade)
        }
        return kind.update?.(current, value) ?? kind.set(value)
    }

    const insert = (time: number, command: Command) =>
        dispatch({ type: "insert_track_command", ...target, time, command })
    const remove = (point: LanePoint) => {
        dispatch({ type: "delete_track_commands", ...target, ids: [point.event.id] })
    }

    const change = (point: LanePoint, value: number) =>
        dispatch({ type: "update_track_command", ...target, command: toEvent(commandOf(point, value), point.event.id) })
    // A lane has one value at a time, so a point already at `time` is replaced
    const pointAt = (time: number, except?: LanePoint) =>
        lanePoints(kind, timeline(commands)).find(point => point.time === time && point.event.id !== except?.event.id)

    return {
        onAdd: (time, value) => {
            const existing = pointAt(time)
            if (existing) {
                change(existing, value)
            } else {
                insert(time, kind.set(value))
            }
        },
        onChange: change,
        onMove: (point, time) => {
            const existing = pointAt(time, point)
            if (existing) {
                remove(existing)
            }
            dispatch({ type: "place_track_command", ...target, id: point.event.id, time, command: commandOf(point, point.value) })
        },
        onDelete: remove,
        onToggleFade: kind.fade && ((point, previous) => {
            if (point.fade !== undefined) {
                remove(point)
                insert(point.time + point.fade, kind.set(point.value))
            } else if (previous) {
                const start = previous.time + (previous.fade ?? 0)
                if (point.time > start) {
                    remove(point)
                    insert(start, kind.fade!(point.value, point.time - start))
                }
            }
        }),
        onSelect: point => docDispatch({ type: "set_selection", selection: { ...target, events: [point.event.id] } }),
        selectedIds,
    }
}
