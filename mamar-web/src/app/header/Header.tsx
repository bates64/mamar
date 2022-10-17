import { Flex, Grid, Heading, View } from "@adobe/react-spectrum"

import BgmActionGroup from "./BgmActionGroup"
import SponsorButton from "./SponsorButton"

import "./Header.scss"

const logo = new URL("../../logo.svg", import.meta.url).href

export default function Header() {
    return <header className="Header">
        <View
            elementType="nav"
            paddingX="size-150"
        >
            <Grid
                columns={["1fr", "auto"]}
                rows={["auto"]}
                alignItems="center"
            >
                <Flex
                    alignItems="center"
                    gap="size-100"
                    UNSAFE_style={{ height: "env(titlebar-area-height, 38px)" }}
                >
                    <Heading level={1}>
                        <a href="/">
                            <img src={logo} alt="Mamar" />
                        </a>
                    </Heading>
                    <BgmActionGroup />
                    <h2 aria-hidden="true">
                        Mamar
                    </h2>
                </Flex>
                <SponsorButton />
            </Grid>
        </View>
    </header>
}
