import classNames from "classnames"
import { useId, useRef } from "react"

import Ruler, { ticksToStyle, useSegmentLengths } from "./Ruler"
import styles from "./SegmentMap.module.scss"
import { TimeProvider } from "./timectx"

import TrackControls from "../emu/TrackControls"
import { useBgm, useDoc, useVariation } from "../store"
import useSelection, { SelectionProvider } from "../util/hooks/useSelection"
import { Track } from "pm64-typegen"

const TRACK_HEAD_WIDTH = 100 // Match with $trackHead-width

function hasParentTrack(track: Track): boolean {
    const { polyphony } = track
    return typeof polyphony === "object" && "ConditionalTakeover" in polyphony
}

function PianoRollThumbnail({ trackIndex, trackListIndex }: { trackIndex: number, trackListIndex: number }) {
    const [doc, dispatch] = useDoc()
    const [bgm] = useBgm()
    const track = bgm?.trackLists[trackListIndex]?.tracks[trackIndex]
    const isSelected = doc?.panelContent.type === "tracker" && doc?.panelContent.trackList === trackListIndex && doc?.panelContent.track === trackIndex
    const nameId = useId()

    if (!track || track.commands.length === 0) {
        return <></>
    } else {
        const handlePress = (evt: any) => {
            dispatch({
                type: "set_panel_content",
                panelContent: isSelected ? { type: "not_open" } : {
                    type: "tracker",
                    trackList: trackListIndex,
                    track: trackIndex,
                },
            })
            evt.stopPropagation()
            evt.preventDefault()
        }

        return <div
            tabIndex={0}
            aria-labelledby={nameId}
            className={classNames({
                [styles.pianoRollThumbnail]: true,
                [styles.drumRegion]: track.isDrumTrack,
                [styles.disabledRegion]: track.isDisabled,
                [styles.hasInterestingParentTrack]: hasParentTrack(track),
                [styles.selected]: isSelected,
            })}
            onClick={handlePress}
            onKeyDown={evt => {
                if (evt.key === "Enter" || evt.key === " ") {
                    handlePress(evt)
                }
            }}
        >
            <div id={nameId} className={styles.segmentName}>{track.name}</div>
        </div>
    }
}

function TrackName({ index }: { index: number }) {
    return <div className={styles.trackName}>
        {index === 0 ? "Master" : `Track ${index}`}
    </div>
}

function Container() {
    const [variation] = useVariation()
    const selection = useSelection()
    const segmentLengths = useSegmentLengths()
    const container = useRef<HTMLDivElement | null>(null)

    const tracks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] // TODO: don't show track 0
    const totalLength = segmentLengths.reduce((acc, len) => acc + len, 0)

    return <TimeProvider value={{
        xToTicks(clientX: number): number {
            if (!container.current) return NaN
            const px = clientX - container.current.getBoundingClientRect().left
            const style = getComputedStyle(container.current)
            const rulerZoom = parseFloat(style.getPropertyValue("--ruler-zoom"))

            const ticks = (px - TRACK_HEAD_WIDTH) * rulerZoom
            if (ticks < 0) return 0
            if (ticks > totalLength) return totalLength
            return ticks
        },

        ticksToXOffset(ticks: number): number {
            if (!container.current) return NaN
            const style = getComputedStyle(container.current)
            const rulerZoom = parseFloat(style.getPropertyValue("--ruler-zoom"))
            return ticks / rulerZoom
        },
    }}>
        <div
            ref={container}
            aria-label="Segments"
            className={styles.table}
            onClick={() => {
                selection.clear()
            }}
        >
            {variation && <div>
                <Ruler />
                {tracks.map(i => <div key={i} className={styles.track} aria-label={`Track ${i}`}>
                    {<div className={styles.trackHead}>
                        <TrackName index={i} />
                        {i > 0 && <TrackControls trackIndex={i} />}
                    </div>}
                    {variation.segments.map((segment, segmentIndex) => {
                        if (segment.type === "Subseg") {
                            return <div
                                key={segment.id}
                                style={ticksToStyle(segmentLengths[segmentIndex])}
                            >
                                <PianoRollThumbnail trackIndex={i} trackListIndex={segment.trackList} />
                            </div>
                        } else {
                            return <div key={segment.id} />
                        }
                    })}
                </div>)}
            </div>}
        </div>
    </TimeProvider>
}

export default function SegmentMap() {
    return <SelectionProvider>
        <Container />
    </SelectionProvider>
}
