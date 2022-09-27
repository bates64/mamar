import { bgm_add_voice } from "mamar-wasm-bridge"
import { Bgm } from "pm64-typegen"

import { useDoc } from "./doc"
import { VariationAction, variationReducer } from "./variation"

export type BgmAction = {
    type: "variation"
    index: number
    action: VariationAction
} | {
    type: "add_voice"
}

export function bgmReducer(bgm: Bgm, action: BgmAction): Bgm {
    switch (action.type) {
    case "variation": {
        const applyVariation = (index: number) => {
            const variation = bgm.variations[index]
            if (index === action.index && variation) {
                return variationReducer(variation, action.action)
            } else {
                return variation
            }
        }
        return {
            ...bgm,
            variations: [
                applyVariation(0),
                applyVariation(1),
                applyVariation(2),
                applyVariation(3),
            ],
        }
    } case "add_voice":
        return bgm_add_voice(bgm)
    }
}

export const useBgm = (docId?: string): [Bgm | undefined, (action: BgmAction) => void] => {
    const [doc, dispatch] = useDoc(docId)
    return [doc?.bgm, action => dispatch({ type: "bgm", action })]
}
