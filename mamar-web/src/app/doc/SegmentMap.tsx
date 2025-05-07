import classNames from "classnames"
import { useId, useRef, createContext, useContext } from "react"

import Ruler, { ticksToStyle, useSegmentLengths } from "./Ruler"
import styles from "./SegmentMap.module.scss"

import TrackControls from "../emu/TrackControls"
import { useBgm, useDoc, useVariation } from "../store"
import useSelection, { SelectionProvider } from "../util/hooks/useSelection"

const TRACK_HEAD_WIDTH = 100 // Match with $trackHead-width

interface Time {
    xToTicks: (clientX: number) => number
}

const TIME_CTX = createContext<Time | null>(null)

export function useTime(): Time {
    const time = useContext(TIME_CTX)

    if (!time) {
        throw new Error("TimeProvider missing in tree")
    }

    return time
}

function PianoRollThumbnail({ trackIndex, trackListIndex }: { trackIndex: number, trackListIndex: number }) {
    const [doc, dispatch] = useDoc()
    const [bgm] = useBgm()
    const track = bgm?.trackLists[trackListIndex]?.tracks[trackIndex]
    const isSelected = doc?.panelContent.type === "tracker" && doc?.panelContent.trackList === trackListIndex && doc?.panelContent.track === trackIndex
    const nameId = useId()

    if (!track || track.commands.vec.length === 0) {
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
                [styles.hasInterestingParentTrack]: track.parentTrackIdx !== 0,
                [styles.selected]: isSelected,
            })}
            onClick={handlePress}
            onKeyDown={evt => {
                if (evt.key === "Enter" || evt.key === " ") {
                    handlePress(evt)
                }
            }}
        >
            <div id={nameId} className={styles.segmentName}>Region {trackListIndex}.{trackIndex}</div>
        </div>
    }
}

function Container() {
    const [variation] = useVariation()
    const selection = useSelection()
    const segmentLengths = useSegmentLengths()
    const container = useRef<HTMLDivElement | null>(null)

    const tracks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] // note: no master track

    return <TIME_CTX.Provider value={{
        xToTicks(clientX: number): number {
            if (!container.current) return NaN
            const px = clientX - container.current.getBoundingClientRect().left
            const style = getComputedStyle(container.current)
            const rulerZoom = parseFloat(style.getPropertyValue("--ruler-zoom"))
            return (px - TRACK_HEAD_WIDTH) * rulerZoom
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
                        <div className={styles.trackName}>Track {i}</div>
                        <TrackControls trackIndex={i} />
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
    </TIME_CTX.Provider>
}

export default function SegmentMap() {
    return <SelectionProvider>
        <Container />
    </SelectionProvider>
}
