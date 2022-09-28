import { Grid, View } from "@adobe/react-spectrum"
import { useEffect } from "react"

import SegmentMap from "./SegmentMap"
import Sequencer from "./Sequencer"

import { useDoc } from "../store"
import WelcomeScreen from "../WelcomeScreen"

export default function ActiveDoc() {
    const [doc] = useDoc()

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

    if (!doc) {
        return <WelcomeScreen />
    }

    if (doc.activeVariation < 0) {
        return <View />
    } else {
        return <Grid rows="50% 50%" height="100%" UNSAFE_style={{ overflow: "hidden" }}>
            <View overflow="overlay">
                <SegmentMap />
            </View>
            <View overflow="overlay" borderTopColor="gray-300" borderTopWidth="thin">
                {doc.panelContent.type === "sequencer" && <Sequencer trackListId={doc.panelContent.trackList} trackIndex={doc.panelContent.track} />}
            </View>
        </Grid>
    }
}
