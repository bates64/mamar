import { View } from "@adobe/react-spectrum"

import BgmFromSbnPicker from "./BgmFromSbnPicker"

export default function WelcomeScreen({ romData }: { romData: ArrayBuffer }) {
    return <View
        padding="size-500"
        backgroundColor="gray-100"
        height="100%"
    >
        <h2>✨ Welcome to Mamar! ✨</h2>
        <BgmFromSbnPicker romData={romData} />
    </View>
}
