import { Item, Picker } from "@adobe/react-spectrum"

import { useDoc } from "../store"

export default function VariationPicker() {
    const [doc, dispatch] = useDoc()

    if (!doc) {
        throw new Error("No doc")
    }

    return <Picker
        label="Variation"
        labelPosition="side"
        labelAlign="end"
        selectedKey={doc.activeVariation}
        onSelectionChange={key => dispatch({ type: "set_variation", index: key as number })}
        disabledKeys={doc.bgm.variations.map((_, i) => i).filter(i => !!doc.bgm.variations[i])}
    >
        {doc.bgm.variations.map((variation, index) => {
            const name = `${index} (${(variation?.segments.length ?? 0) === 1 ? "1 segment" : `${variation?.segments.length ?? 0} segments`})`
            return <Item key={index}>
                {name}
            </Item>
        })}
    </Picker>
}
