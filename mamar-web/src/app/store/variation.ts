import { Segment, Variation } from "pm64-typegen"

import { useBgm } from "./bgm"
import { useDoc } from "./doc"
import { SegmentAction, segmentReducer } from "./segment"

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
    type: "add_loop_start"
    id: number
    iterCount: number
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
        const fromIndex = variation.segments.findIndex(s => s.id === action.id)
        if (fromIndex !== -1) {
            const segment = variation.segments[fromIndex]
            let segments: (Segment | null)[] = JSON.parse(JSON.stringify(variation.segments))

            segments[fromIndex] = null
            segments.splice(action.toIndex, 0, segment)
            segments = segments.filter(s => s !== null)

            // If EndLoop > StartLoop, swap them
            for (let i = 0; i < segments.length; i++) {
                const endLoop = segments[i]
                if (endLoop?.type === "EndLoop") {
                    for (let j = i + 1; j < segments.length; j++) {
                        const startLoop = segments[j]
                        if (startLoop?.type === "StartLoop" && startLoop.label_index === endLoop.label_index) {
                            const temp = segments[i]
                            segments[i] = segments[j]
                            segments[j] = temp
                            break
                        }
                    }
                }
            }

            // If StartLoop and EndLoop are next to each other, remove them
            for (let i = 0; i < segments.length - 1; i++) {
                const a = segments[i]
                const b = segments[i + 1]
                if (a?.type === "StartLoop" &&
                    b?.type === "EndLoop" &&
                    a.label_index === b.label_index
                ) {
                    segments[i] = null
                    segments[i + 1] = null
                }
            }

            return {
                ...variation,
                segments: segments.filter(s => s !== null) as Segment[],
            }
        } else {
            return variation
        }
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
    case "add_loop_start": {

        const startLoopSeg: Segment = {
            id: action.id,
            type: "StartLoop",
            label_index: variation.segments.length ?? 0,
        }
        const loopSubSeg: Segment = {
            type: "Subseg",
            id: action.id + 1,
            trackList: variation.segments.length + 1,
        }
        const endLoopSeg: Segment = {
            type: "EndLoop",
            id: action.id + 2,
            label_index: variation.segments.length + 2,
            iter_count: action.iterCount,
        }
        return {
            ...variation,
            segments: [
                ...variation.segments,
                startLoopSeg,
                loopSubSeg,
                endLoopSeg,
            ],
        }
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
