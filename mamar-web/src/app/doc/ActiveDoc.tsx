import { Flex, View } from "@adobe/react-spectrum"

import styles from "./ActiveDoc.module.scss"
import Ruler from "./Ruler"
import SegmentMap from "./SegmentMap"
import SubsegDetails from "./SubsegDetails"
import TimeProvider from "./TimeProvider"

import { useDoc } from "../store"

export default function ActiveDoc() {
    const [doc] = useDoc()

    const trackListId = doc?.panelContent.type === "tracker" ? doc?.panelContent.trackList : null
    const trackIndex = doc?.panelContent.type === "tracker" ? doc?.panelContent.track : null
    const segmentIndex = doc?.panelContent.type === "tracker" ? doc?.panelContent.segment : null

    if (!doc || doc.activeVariation < 0) {
        return <View />
    } else {
        return <TimeProvider>
            <div
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
                </Flex>
                {doc.panelContent.type !== "not_open" && <View
                    elementType="aside"
                    overflow="hidden"
                    borderTopColor="gray-300"
                    backgroundColor="gray-100"
                    borderTopWidth="thin"
                    UNSAFE_style={{ zIndex: "1" }}
                >
                    {doc.panelContent.type === "tracker" && <SubsegDetails key={`${trackListId}_${trackIndex}`} trackListId={trackListId!} trackIndex={trackIndex!} segmentIndex={segmentIndex!} />}
                </View>}
            </div>
        </TimeProvider>
    }
}
