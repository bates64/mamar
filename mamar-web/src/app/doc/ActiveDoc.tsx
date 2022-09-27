import { ActionButton, Grid, View } from "@adobe/react-spectrum"
import { useEffect } from "react"

import Sequencer from "./Sequencer"
import VariationsMap from "./VariationsMap"

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

    if (!doc) {
        return <WelcomeScreen />
    }

    if (doc.activeVariation < 0) {
        return <View />
    } else if (doc.activeTrackListId === -1) {
        return <VariationsMap />
    } else {
        return <View padding="size-100" height="100%" overflow="hidden">
            <Grid rows="1fr auto" gap="size-100">
                <View>
                    <ActionButton onPress={() => {
                        dispatch({
                            type: "close_track_list",
                        })
                    }}>
                        Close sequencer
                    </ActionButton>
                </View>
                <Sequencer trackListId={doc.activeTrackListId} />
            </Grid>
        </View>
    }
}
