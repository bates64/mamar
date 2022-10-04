import { View } from "@adobe/react-spectrum"

import BgmFromSbnPicker from "./sbn/BgmFromSbnPicker"

export default function WelcomeScreen() {
    return <View
        padding="size-500"
        height="100%"
    >
        <h2>✨ Welcome to Mamar! ✨</h2>
        <BgmFromSbnPicker />
    </View>
}
