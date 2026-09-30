import { ActionButton, Item, Menu, MenuTrigger, Text } from "@adobe/react-spectrum"
import classNames from "classnames"
import { Command, Event } from "pm64-typegen"
import { useMemo, useState } from "react"
import { Plus } from "react-feather"

import CommandPopup from "./CommandPopup"
import FixedPopover, { ChoiceList } from "./FixedPopover"
import InstrumentEditor from "./InstrumentEditor"
import { defaultValue, LaneKind, startingEvents, timeline, trackLanes } from "./lanes"
import { CarriedValue, useCarriedValues, useMixCommands } from "./segmentTracks"
import styles from "./StartingValues.module.scss"
import { toEvent } from "./useLaneEditing"

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

function summaryOf({ event, kinds }: StartingValue, auxBanks?: string[]): string {
    if ("TrackOverridePatch" in event) {
        return instruments.getName(event.TrackOverridePatch, auxBanks)
    }
    return kinds.map(kind => (kind.format ?? String)(valueOf(kind, event))).join(", ")
}

/** Values carried from earlier segments, grouped as the commands that set them would be. */
interface CarriedGroup {
    name: string
    values: CarriedValue[]
}

function groupCarried(values: CarriedValue[]): CarriedGroup[] {
    const groups: CarriedGroup[] = []
    for (const value of values) {
        const name = value.kind.name.split(" ")[0]
        const group = groups.find(group => group.name === name)
        if (group) {
            group.values.push(value)
        } else {
            groups.push({ name, values: [value] })
        }
    }
    return groups.map(group => (group.values.length === 1 ? { ...group, name: group.values[0].kind.name } : group))
}

/**
 * The commands that set `values` at the start of a segment: one command if a kind's command can hold all of them, as
 * tremolo's can, or one for each.
 */
function commandsFor(values: CarriedValue[]): Command[] {
    for (const base of values) {
        let command = base.kind.set(base.value)
        const others = values.filter(other => other !== base)
        if (others.every(other => other.kind.read(command as unknown as Record<string, unknown>) !== undefined)) {
            for (const other of others) {
                command = other.kind.update?.(command as unknown as Record<string, unknown>, other.value) ?? command
            }
            return [command]
        }
    }
    return values.map(({ kind, value }) => kind.set(value))
}

/**
 * What a track starts the segment with, such as its instrument, volume, and pan, as in a DAW's channel strip. Its
 * lanes show only the changes after the start. Click a value to change or remove it, or add one with the menu. Values
 * the track keeps from earlier segments are dimmed, and clicking one sets it in this segment.
 */
export default function StartingValues({ trackListId, trackIndex, mainIndex, segmentIndex }: {
    trackListId: number
    trackIndex: number
    /** The track, or the track that its alternate part is for, and the segment, whose earlier segments carry values. */
    mainIndex: number
    segmentIndex: number
}) {
    const [bgm, dispatch] = useBgm()
    const commands = useMixCommands(bgm?.track_lists[trackListId]?.tracks[trackIndex]?.commands)
    const kinds = useMemo(() => (bgm ? trackLanes(bgm) : []), [bgm])
    const values = useMemo(() => startingEvents(kinds, timeline(commands ?? [])).map(({ event }) => ({
        event,
        kinds: kinds.filter(kind => kind.read(event as unknown as Record<string, unknown>) !== undefined),
    })), [commands, kinds])
    const [open, setOpen] = useState<{ id: number, anchor: DOMRect } | null>(null)
    const target = { trackList: trackListId, track: trackIndex }

    const unset = kinds.filter(kind => !values.some(value => value.kinds.includes(kind)))
    const opened = values.find(value => value.event.id === open?.id)
    const carried = useCarriedValues(mainIndex, segmentIndex)
    const carriedGroups = groupCarried(carried.values.filter(value => unset.some(kind => kind.key === value.kind.key)))
    const carriedPatch = values.some(({ event }) => "TrackOverridePatch" in event) ? null : carried.patch
    const setHere = (commands: Command[]) => {
        for (const command of commands) {
            dispatch({ type: "insert_track_command", ...target, time: 0, command })
        }
    }

    const remove = (event: Event) => {
        dispatch({ type: "delete_track_commands", ...target, ids: [event.id] })
        setOpen(null)
    }

    return <div className={styles.values}>
        <div className={styles.heading}>
            <Text>At region start</Text>
            {unset.length > 0 && <MenuTrigger>
                <ActionButton isQuiet aria-label="Add a value at region start">
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
            <span className={styles.summary}>{summaryOf(value, bgm?.aux_banks)}</span>
        </button>)}
        {carriedPatch && <button
            className={classNames(styles.value, styles.carried)}
            title="From an earlier region"
            onClick={() => setHere([{ TrackOverridePatch: carriedPatch }])}
        >
            <span className={styles.name}>Patch</span>
            <span className={styles.summary}>{instruments.getName(carriedPatch, bgm?.aux_banks)}</span>
        </button>}
        {carriedGroups.map(group => <button
            key={group.name}
            className={classNames(styles.value, styles.carried)}
            title="From an earlier region"
            onClick={() => setHere(commandsFor(group.values))}
        >
            <span className={styles.name}>{group.name}</span>
            <span className={styles.summary}>
                {group.values.map(({ kind, value }) => (kind.format ?? String)(value)).join(", ")}
            </span>
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
