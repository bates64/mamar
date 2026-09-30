import { Flex, View } from "@adobe/react-spectrum"
import { Event } from "pm64-typegen"
import { DragDropContext, Droppable, DropResult } from "react-beautiful-dnd"

import styles from "./ActiveDoc.module.scss"
import Ruler from "./Ruler"
import SegmentMap from "./SegmentMap"
import SubsegDetails from "./SubsegDetails"
import TimeProvider from "./TimeProvider"

import Bridge from "../bridge"
import { useDoc } from "../store"
import { playingTrack } from "../store/bgm"
import { DEFAULT_LOCATION } from "../store/doc"

export default function ActiveDoc() {
    const [doc, dispatch] = useDoc()

    const trackListId = doc?.panelContent.type === "tracker" ? doc?.panelContent.trackList : null
    const mainIndex = doc?.panelContent.type === "tracker" ? doc?.panelContent.track : null
    const segmentIndex = doc?.panelContent.type === "tracker" ? doc?.panelContent.segment : null
    const openTrackList = trackListId !== null ? doc?.bgm.track_lists[trackListId] : undefined
    // Edits go to the version of the track that's showing
    const trackIndex = openTrackList && mainIndex !== null
        ? playingTrack(openTrackList, mainIndex, (doc?.location ?? DEFAULT_LOCATION).alternateParts)
        : mainIndex

    function onDragEnd(result: DropResult) {
        if (trackListId === null || trackIndex === null || segmentIndex === null) {
            console.warn("drag end with no open region")
            return
        }

        if (!result.destination) {
            return
        }

        if (result.destination.droppableId === "trash") {
            const commands = doc?.bgm.track_lists[trackListId]?.tracks[trackIndex]?.commands ?? []
            const id = (Bridge.commands_without_detours(commands) as Event[])[result.source.index]?.id
            if (id === undefined) return
            dispatch({
                type: "bgm",
                action: {
                    type: "delete_track_commands",
                    trackList: trackListId,
                    track: trackIndex,
                    ids: [id],
                },
            })
        } else {
            dispatch({
                type: "bgm",
                action: {
                    type: "move_track_command",
                    trackList: trackListId,
                    track: trackIndex,
                    oldIndex: result.source.index,
                    newIndex: result.destination.index,
                },
            })
        }
    }

    if (!doc || doc.activeVariation < 0) {
        return <View />
    } else {
        return <TimeProvider>
            <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="trash">
                    {(provided, _snapshot) => (
                        <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={styles.container}
                            style={{
                                gridTemplateRows: doc.panelContent.type === "not_open" ? "100%" : "50% 50%",
                                overflow: "hidden",
                                backgroundColor: "var(--spectrum-gray-100)",
                            }}
                        >
                            <Flex direction="column" UNSAFE_style={{ overflowX: "hidden" }}>
                                <div style={{ paddingLeft: "225px" }}>
                                    <Ruler />
                                </div>
                                <SegmentMap />
                                {provided.placeholder}
                            </Flex>
                            {doc.panelContent.type !== "not_open" && <View
                                elementType="aside"
                                overflow="hidden"
                                borderTopColor="gray-300"
                                backgroundColor="gray-100"
                                borderTopWidth="thin"
                                UNSAFE_style={{ zIndex: "1" }}
                            >
                                {doc.panelContent.type === "tracker" && <SubsegDetails key={`${trackListId}_${mainIndex}`} trackListId={trackListId!} trackIndex={mainIndex!} segmentIndex={segmentIndex!} />}
                            </View>}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
        </TimeProvider>
    }
}
