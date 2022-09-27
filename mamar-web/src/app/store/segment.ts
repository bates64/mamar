import { Segment } from "pm64-typegen"

import { useVariation } from "./variation"

export type SegmentAction = {
    type: "set_loop_iter_count"
    iter_count: number
}

export function segmentReducer(segment: Segment, action: SegmentAction): Segment {
    switch (action.type) {
    case "set_loop_iter_count":
        if (segment.type === "EndLoop") {
            return {
                ...segment,
                iter_count: action.iter_count,
            }
        } else {
            console.warn("Tried to set loop iter count on non-end loop segment")
            return segment
        }
    }
}

export const useSegment = (id?: number, variationIndex?: number, docId?: string): [Segment | undefined, (action: SegmentAction) => void] => {
    const [variation, dispatch] = useVariation(variationIndex, docId)
    return [
        variation?.segments.find(s => s.id === id),
        action => {
            if (id) {
                dispatch({
                    type: "segment",
                    id,
                    action,
                })
            }
        },
    ]
}
