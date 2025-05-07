import produce from "immer"
import { Segment, Variation } from "pm64-typegen"

import { useBgm } from "./bgm"
import { useDoc } from "./doc"
import { SegmentAction, segmentReducer } from "./segment"

function cleanLoops(segments: (Segment | null)[]): Segment[] {
    return produce(segments, cleaned => {
        // Ensure StartLoop comes before EndLoop with the same label_index
        for (let i = 0; i < cleaned.length; i++) {
            const endLoop = cleaned[i]
            if (endLoop?.type === "EndLoop") {
                for (let j = i + 1; j < cleaned.length; j++) {
                    const startLoop = cleaned[j]
                    if (startLoop?.type === "StartLoop" && startLoop.label_index === endLoop.label_index) {
                        const temp = cleaned[i]
                        cleaned[i] = cleaned[j]
                        cleaned[j] = temp
                        break
                    }
                }
            }
        }

        // Remove adjacent StartLoop and EndLoop with matching label_index
        for (let i = 0; i < cleaned.length - 1; i++) {
            const a = cleaned[i]
            const b = cleaned[i + 1]
            if (a?.type === "StartLoop" &&
                b?.type === "EndLoop" &&
                a.label_index === b.label_index
            ) {
                cleaned[i] = null
                cleaned[i + 1] = null
            }
        }
    }).filter(s => s !== null)
}

export type VariationAction = {
    type: "segment"
    id: number
    action: SegmentAction
} | {
    type: "move_segment"
    id: number
    toIndex: number
} | {
    type: "add_segment"
    id: number
    trackList: number
} | {
    type: "toggle_segment_loop"
    id: number
}

export function variationReducer(variation: Variation, action: VariationAction): Variation {
    switch (action.type) {
    case "segment":
        return {
            ...variation,
            segments: variation.segments.map(segment => {
                if (segment.id === action.id) {
                    return segmentReducer(segment, action.action)
                } else {
                    return segment
                }
            }),
        }
    case "move_segment":
        return produce(variation, draft => {
            const fromIndex = draft.segments.findIndex(s => s.id === action.id)
            if (fromIndex === -1) return

            const segment = draft.segments[fromIndex]
            draft.segments[fromIndex] = null as any
            draft.segments.splice(action.toIndex, 0, segment)

            draft.segments = cleanLoops(draft.segments)
        })
    case "add_segment":
        const newSeg: Segment = {
            type: "Subseg",
            id: action.id,
            trackList: action.trackList,
        }
        return {
            ...variation,
            segments: [
                ...variation.segments,
                newSeg,
            ],
        }
    case "toggle_segment_loop": {
        return produce(variation, draft => {
            const i = draft.segments.findIndex(s => s.id === action.id)
            if (i === -1) return

            let inLoop = false
            let loopStartIndex = -1
            let loopEndIndex = -1

            // Traverse backwards to find StartLoops
            for (let j = i - 1; j >= 0; j--) {
                const s = draft.segments[j]
                if (s.type === "StartLoop" && s.label_index !== undefined) {
                    const startIndex = s.label_index
                    // Now, search for matching EndLoop after the StartLoop
                    for (let k = i + 1; k < draft.segments.length; k++) {
                        const segment = draft.segments[k]
                        if (segment.type === "EndLoop" && segment.label_index === startIndex) {
                            inLoop = true
                            loopStartIndex = j
                            loopEndIndex = k
                            break
                        }
                    }
                    if (inLoop) break
                }
            }

            const nextId = Math.max(...draft.segments.map(s => s.id)) + 1
            const nextLabel = Math.max(0, ...draft.segments.map(s => ((s.type === "StartLoop" || s.type === "EndLoop") ? s.label_index ?? 0 : 0))) + 1

            if (inLoop) {
                // Remove the loop start/end
                draft.segments.splice(loopStartIndex, 1)
                draft.segments.splice(loopEndIndex - 1, 1)
            } else {
                // Create a new loop around this segment
                draft.segments.splice(i, 0, { type: "StartLoop", id: nextId, label_index: nextLabel })
                draft.segments.splice(i + 2, 0, { type: "EndLoop", id: nextId + 1, label_index: nextLabel, iter_count: 0 })
            }

            draft.segments = cleanLoops(draft.segments)
        })
    }
    }
}

export const useVariation = (index?: number, docId?: string): [Variation | undefined, (action: VariationAction) => void] => {
    const [doc] = useDoc()
    const [bgm, dispatch] = useBgm(docId)

    if (typeof index === "undefined") {
        index = doc?.activeVariation
    }

    return [
        bgm?.variations[index as number] ?? undefined,
        action => {
            if (typeof index === "number") {
                dispatch({
                    type: "variation",
                    index,
                    action,
                })
            }
        },
    ]
}
