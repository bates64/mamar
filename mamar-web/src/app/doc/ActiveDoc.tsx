import { View } from "@adobe/react-spectrum"
import { useEffect } from "react"
import { DragDropContext, Droppable, DropResult } from "react-beautiful-dnd"

import styles from "./ActiveDoc.module.scss"
import SegmentMap from "./SegmentMap"
import SubsegDetails from "./SubsegDetails"

import { useDoc } from "../store"
import WelcomeScreen from "../WelcomeScreen"

export default function ActiveDoc() {
    const [doc, dispatch] = useDoc()

    const title = doc ? (doc.isSaved ? doc.name : `${doc.name} (unsaved)`) : "Mamar"
    useEffect(() => {
        document.title = title

        if (doc && !doc.isSaved) {
            const onbeforeunload = (evt: BeforeUnloadEvent) => {
                evt.preventDefault()
                return evt.returnValue = "You have unsaved changes."
            }
            window.addEventListener("beforeunload", onbeforeunload)
            return () => window.removeEventListener("beforeunload", onbeforeunload)
        }
    }, [title, doc])

    const trackListId = doc?.panelContent.type === "tracker" ? doc?.panelContent.trackList : null
    const trackIndex = doc?.panelContent.type === "tracker" ? doc?.panelContent.trackList : null

    function onDragEnd(result: DropResult) {
        if (!trackListId || !trackIndex) {
            console.warn("drag end with no open region")
            return
        }

        if (!result.destination) {
            return
        }

        if (result.destination.droppableId === "trash") {
            dispatch({
                type: "bgm",
                action: {
                    type: "delete_track_command",
                    trackList: trackListId,
                    track: trackIndex,
                    index: result.source.index,
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

    if (!doc) {
        return <WelcomeScreen />
    }

    if (doc.activeVariation < 0) {
        return <View />
    } else {
        return <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="trash">
                {(provided, _snapshot) => (
                    <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={styles.container}
                        style={{
                            gridTemplateRows: doc.panelContent.type === "not_open" ? "100%" : "50% 50%",
                            overflow: "hidden",
                        }}
                    >
                        <View overflow="overlay">
                            <SegmentMap />
                            {provided.placeholder}
                        </View>
                        {doc.panelContent.type !== "not_open" && <View elementType="aside" overflow="hidden" borderTopColor="gray-300" backgroundColor="gray-100" borderTopWidth="thin">
                            {doc.panelContent.type === "tracker" && <SubsegDetails trackListId={trackListId!} trackIndex={trackIndex!} />}
                        </View>}
                    </div>
                )}
            </Droppable>
        </DragDropContext>
    }
}
