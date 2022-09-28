import { Segment } from "pm64-typegen"

import styles from "./SegmentMap.module.scss"

import { useBgm, useDoc, useVariation } from "../store"
import useSelection, { SelectionProvider } from "../util/hooks/useSelection"

interface Loop {
    start: number
    end: number
}

function getLoops(segments: Segment[]): Loop[] {
    const loops = []

    for (let startIdx = 0; startIdx < segments.length; startIdx++) {
        const start = segments[startIdx]
        if (start.type === "StartLoop") {
            // Look for EndLoop
            for (let endIdx = 0; endIdx < segments.length; endIdx++) {
                const end = segments[endIdx]
                if (end.type === "EndLoop" && end.label_index === start.label_index) {
                    loops.push({
                        start: startIdx,
                        end: endIdx,
                    })
                    break
                }
            }
        }
    }

    return loops
}

function PianoRollThumbnail({ trackIndex, trackListIndex }: { trackIndex: number, trackListIndex: number }) {
    const [, dispatch] = useDoc()
    const [bgm] = useBgm()
    const track = bgm?.trackLists[trackListIndex]?.tracks[trackIndex]

    if (!track || track.commands.vec.length === 0) {
        return <></>
    } else {
        return <div
            className={styles.pianoRollThumbnail}
            onDoubleClick={evt => {
                dispatch({
                    type: "set_panel_content",
                    panelContent: {
                        type: "sequencer",
                        trackList: trackListIndex,
                        track: trackIndex,
                    },
                })
                evt.stopPropagation()
                evt.preventDefault()
            }}
        >
            Flags: {track.flags.toString(16)}
        </div>
    }
}

function Container() {
    const [variation] = useVariation()
    const selection = useSelection()

    const tracks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
    const loops = getLoops(variation?.segments ?? [])

    return <table
        className={styles.table}
        onClick={() => {
            selection.clear()
        }}
    >
        {variation && <tbody>
            {loops.map(({ start, end }) => {
                const endSeg = variation.segments[end]

                if (endSeg.type !== "EndLoop")
                    throw new Error("Expected EndLoop")

                return <tr>
                    <td colSpan={start + 1} />
                    <td colSpan={end - start + 1} className={styles.loop}>
                        Loop {endSeg.iter_count !== 0 && `${endSeg.iter_count}x`}
                    </td>
                </tr>
            })}
            {tracks.map(i => <tr key={i} className={styles.track}>
                <td className={styles.trackHead}>
                    Track {i + 1}
                </td>
                {variation.segments.map(segment => {
                    if (segment.type === "Subseg") {
                        return <td
                            key={segment.id}
                        >
                            <PianoRollThumbnail trackIndex={i} trackListIndex={segment.trackList} />
                        </td>
                    } else {
                        return <td key={segment.id} />
                    }
                })}
            </tr>)}
        </tbody>}
    </table>
}

export default function SegmentMap() {
    return <SelectionProvider>
        <Container />
    </SelectionProvider>
}
