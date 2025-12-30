import { Segment } from "pm64-typegen"

import { useVariation } from "./variation"

export type SegmentAction = {
    type: "set_loop_iter_count"
    iter_count: number
}

export function segmentReducer(segment: Segment, action: SegmentAction): Segment {
    switch (action.type) {
    case "set_loop_iter_count":
        if ("EndLoop" in segment) {
            return {
                EndLoop: {
                    ...segment.EndLoop,
                    iter_count: action.iter_count,
                },
            }
        } else {
            console.warn("Tried to set loop iter count on non-end loop segment")
            return segment
        }
    }
}

export function getSegmentId(segment: Segment): number | undefined {
    if ("Subseg" in segment) {
        return segment.Subseg.id
    } else if ("StartLoop" in segment) {
        return segment.StartLoop.id
    } else if ("Wait" in segment) {
        return segment.Wait.id
    } else if ("EndLoop" in segment) {
        return segment.EndLoop.id
    } else if ("Unknown6" in segment) {
        return segment.Unknown6.id
    } else if ("Unknown7" in segment) {
        return segment.Unknown7.id
    }
}

export const useSegment = (id?: number, variationIndex?: number, docId?: string): [Segment | undefined, (action: SegmentAction) => void] => {
    const [variation, dispatch] = useVariation(variationIndex, docId)
    return [
        variation?.segments.find(s => getSegmentId(s) === id),
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
