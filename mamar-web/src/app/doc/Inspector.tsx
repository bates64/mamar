import { ActionButton, Flex, Text, View } from "@adobe/react-spectrum"
import { useMemo } from "react"

import CommandEditor from "./CommandEditor"
import { timeline } from "./lanes"

import { useBgm, useDoc } from "../store"

/** Edits the exact values of the selected command in track `trackIndex` of track list `trackListId`. */
export default function Inspector({ trackListId, trackIndex }: { trackListId: number, trackIndex: number }) {
    const [doc, docDispatch] = useDoc()
    const [bgm, dispatch] = useBgm()
    const commands = bgm?.track_lists[trackListId]?.tracks[trackIndex]?.commands
    const played = useMemo(() => timeline(commands ?? []), [commands])

    const selection = doc?.selection
    if (!commands || selection?.trackList !== trackListId || selection.track !== trackIndex) {
        return null
    }
    // One command at a time
    const selected = selection.events.length === 1 ? played.find(({ event }) => event.id === selection.events[0]) : undefined
    if (!selected) {
        return null
    }

    return <View paddingTop="size-200">
        <Flex alignItems="center" justifyContent="space-between">
            <Text><b>Selected</b> at tick {selected.time}</Text>
            <ActionButton
                isQuiet
                onPress={() => {
                    dispatch({ type: "delete_track_commands", trackList: trackListId, track: trackIndex, ids: [selected.event.id] })
                    docDispatch({ type: "set_selection", selection: null })
                }}
            >
                Delete
            </ActionButton>
        </Flex>
        <CommandEditor command={selected.event} trackListId={trackListId} trackIndex={trackIndex} />
    </View>
}
