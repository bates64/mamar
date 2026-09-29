import { ActionButton, Item, Menu, MenuTrigger, Text } from "@adobe/react-spectrum"
import { Event } from "pm64-typegen"
import { useMemo, useState } from "react"
import { Plus } from "react-feather"

import CommandPopup from "./CommandPopup"
import FixedPopover, { ChoiceList } from "./FixedPopover"
import InstrumentEditor from "./InstrumentEditor"
import { defaultValue, LaneKind, startingEvents, timeline, trackLanes } from "./lanes"
import styles from "./StartingValues.module.scss"
import { toEvent } from "./useLaneEditing"

import Bridge from "../bridge"
import * as instruments from "../instruments"
import { useBgm } from "../store"

/** A command the track starts with, and the lanes that show its values. */
interface StartingValue {
    event: Event
    kinds: LaneKind[]
}

function valueOf(kind: LaneKind, event: Event): number {
    return kind.read(event as unknown as Record<string, unknown>)!.value
}

/** A name for a command that sets values for several lanes, such as tremolo, which sets its depth, speed, and delay. */
function nameOf({ event, kinds }: StartingValue): string {
    if ("TrackOverridePatch" in event) {
        return "Patch"
    }
    return kinds.length > 1 ? kinds[0].name.split(" ")[0] : kinds[0].name
}

function summaryOf({ event, kinds }: StartingValue): string {
    if ("TrackOverridePatch" in event) {
        return instruments.getName(event.TrackOverridePatch)
    }
    return kinds.map(kind => (kind.format ?? String)(valueOf(kind, event))).join(", ")
}

/**
 * What a track starts the segment with, such as its instrument, volume, and pan, as in a DAW's channel strip. Its
 * lanes show only the changes after the start. Click a value to change or remove it, or add one with the menu.
 */
export default function StartingValues({ trackListId, trackIndex }: { trackListId: number, trackIndex: number }) {
    const [bgm, dispatch] = useBgm()
    const commands = bgm?.track_lists[trackListId]?.tracks[trackIndex]?.commands
    const kinds = useMemo(() => (bgm ? trackLanes(bgm) : []), [bgm])
    const values = useMemo(() => startingEvents(kinds, timeline(commands ?? [])).map(({ event }) => ({
        event,
        kinds: kinds.filter(kind => kind.read(event as unknown as Record<string, unknown>) !== undefined),
    })), [commands, kinds])
    const [open, setOpen] = useState<{ id: number, anchor: DOMRect } | null>(null)
    const target = { trackList: trackListId, track: trackIndex }

    const unset = kinds.filter(kind => !values.some(value => value.kinds.includes(kind)))
    const opened = values.find(value => value.event.id === open?.id)

    const remove = (event: Event) => {
        const index = Bridge.commands_without_detours(commands ?? []).findIndex((played: Event) => played.id === event.id)
        if (index >= 0) {
            dispatch({ type: "delete_track_command", ...target, index })
        }
        setOpen(null)
    }

    return <div className={styles.values}>
        <div className={styles.heading}>
            <Text>At segment start</Text>
            {unset.length > 0 && <MenuTrigger>
                <ActionButton isQuiet aria-label="Add a value at segment start">
                    <Plus size={14} />
                </ActionButton>
                <Menu
                    items={unset}
                    onAction={key => {
                        const kind = unset.find(kind => kind.key === key)
                        if (kind) {
                            dispatch({ type: "insert_track_command", ...target, time: 0, command: kind.set(defaultValue(kind)) })
                        }
                    }}
                >
                    {kind => <Item key={kind.key}>{kind.name}</Item>}
                </Menu>
            </MenuTrigger>}
        </div>
        {values.map(value => <button
            key={value.event.id}
            className={styles.value}
            onClick={event => setOpen({ id: value.event.id, anchor: event.currentTarget.getBoundingClientRect() })}
        >
            <span className={styles.name}>{nameOf(value)}</span>
            <span className={styles.summary}>{summaryOf(value)}</span>
        </button>)}
        {opened && open && <FixedPopover anchor={open.anchor} onClose={() => setOpen(null)}>
            {"SetTrackVoice" in opened.event
                ? <InstrumentEditor event={opened.event} trackListId={trackListId} trackIndex={trackIndex} />
                : opened.kinds.length === 1 && opened.kinds[0].discrete
                    ? <DiscreteChoice kind={opened.kinds[0]} event={opened.event} trackListId={trackListId} trackIndex={trackIndex} />
                    : <CommandPopup event={opened.event} trackListId={trackListId} trackIndex={trackIndex} />}
            <button className={styles.remove} onClick={() => remove(opened.event)}>Remove</button>
        </FixedPopover>}
    </div>
}

/** Chooses a starting value that's one of a list, such as which of the song's instruments the track plays. */
function DiscreteChoice({ kind, event, trackListId, trackIndex }: { kind: LaneKind, event: Event, trackListId: number, trackIndex: number }) {
    const [, dispatch] = useBgm()
    const current = event as unknown as Record<string, unknown>

    return <ChoiceList
        label={kind.name}
        choices={Array.from({ length: kind.max - kind.min + 1 }, (_, i) => ({ value: kind.min + i, name: (kind.format ?? String)(kind.min + i) }))}
        value={valueOf(kind, event)}
        onChoose={choice => dispatch({
            type: "update_track_command",
            trackList: trackListId,
            track: trackIndex,
            command: toEvent(kind.update?.(current, choice) ?? kind.set(choice), event.id),
        })}
    />
}
