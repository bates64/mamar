import { Item, Picker } from "@adobe/react-spectrum"

import { useDoc } from "../store"

export default function VariationSelect() {
    const [doc, dispatch] = useDoc()

    if (!doc) {
        throw new Error("no doc")
    }

    const nameVariation = (index: number) => {
        if (doc.bgm.variations[index]) {
            return `Variation ${index}`
        } else {
            return `Variation ${index} (empty)`
        }
    }

    return <Picker
        label="Choose variation"
        selectedKey={doc.selectedVariationIndex}
        onSelectionChange={selected => {
            dispatch({ type: "select_variation", index: selected as number })
        }}
    >
        <Item key={0}>{nameVariation(0)}</Item>
        <Item key={1}>{nameVariation(1)}</Item>
        <Item key={2}>{nameVariation(2)}</Item>
        <Item key={3}>{nameVariation(3)}</Item>
    </Picker>
}
