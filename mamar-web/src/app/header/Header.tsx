import { Flex, Heading, View } from "@adobe/react-spectrum"

import BgmActionGroup from "./BgmActionGroup"

import "./Header.scss"

const logo = new URL("../../mamar-flat.svg", import.meta.url).href

export default function Header() {
    return <header className="Header">
        <View
            paddingX="size-150"
        >
            <Flex
                height="size-500"
                alignItems="center"
                gap="size-100"
            >
                <Heading level={1}>
                    <img src={logo} alt="Mamar" />
                </Heading>
                <BgmActionGroup />
            </Flex>
        </View>
    </header>
}
