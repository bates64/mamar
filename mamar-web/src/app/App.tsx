import { Provider as SpectrumProvider, defaultTheme, Grid, View } from "@adobe/react-spectrum"
import { useEffect, useState } from "react"

import DocTabs from "./DocTabs"
import PaperMarioRomInput from "./emu/PaperMarioRomInput"
import Header from "./header/Header"
import { RootProvider } from "./store"
import useMupen from "./util/hooks/useMupen"

export default function App() {
    const [rom, setRom] = useState<ArrayBuffer>()
    const mupen = useMupen(rom)

    useEffect(() => {
        if (!mupen) {
            return
        }

        //mupen.start().then(() => console.log("Emulator started"))
    }, [mupen])

    return <RootProvider>
        <SpectrumProvider theme={defaultTheme}>
            <View backgroundColor="gray-50">
                <Grid
                    areas={[
                        "header",
                        "content",
                        "footer",
                    ]}
                    columns={["1fr"]}
                    rows={["size-500", "auto", "22px"]}
                    height="100vh"
                >
                    <View gridArea="header">
                        <Header />
                    </View>
                    <View gridArea="content">
                        <main style={{ height: "100%" }}>
                            <DocTabs />
                        </main>
                    </View>
                    <View gridArea="footer" backgroundColor="gray-50" borderColor="gray-200" borderTopWidth={1}>
                    </View>
                </Grid>
            </View>
        </SpectrumProvider>
    </RootProvider>
}
