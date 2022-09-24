import { Flex, Grid, Heading, View } from "@adobe/react-spectrum"

import BgmActionGroup from "./BgmActionGroup"

import PlaybackControls from "../emu/PlaybackControls"

import "./Header.scss"

const logo = new URL("../../mamar-flat.svg", import.meta.url).href

export default function Header() {
    return <header className="Header">
        <View
            paddingX="size-150"
        >
            <Grid
                columns={["1fr", "auto"]}
                rows={["auto"]}
            >
                <Flex
                    height="size-500"
                    alignItems="center"
                    gap="size-100"
                >
                    <Heading level={1}>
                        <a href="/">
                            <img src={logo} alt="Mamar" />
                        </a>
                    </Heading>
                    <BgmActionGroup />
                </Flex>
            </Grid>
        </View>
        <PlaybackControls />
    </header>
}
