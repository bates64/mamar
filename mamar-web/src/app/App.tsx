import { Provider as SpectrumProvider, defaultTheme, Grid, View } from "@adobe/react-spectrum"

import Header from "./header/Header"
import Main from "./Main"
import { RootProvider } from "./store/dispatch"
import { RomDataProvider } from "./util/hooks/useRomData"

export default function App() {
    return <RootProvider>
        <SpectrumProvider theme={defaultTheme}>
            <View UNSAFE_className="App">
                <RomDataProvider>
                    <Grid
                        areas={[
                            "header",
                            "content",
                            "footer",
                        ]}
                        columns={["1fr"]}
                        rows={["auto", "1fr", "22px"]}
                        height="100vh"
                    >
                        <View gridArea="header">
                            <Header />
                        </View>
                        <View gridArea="content" overflow="auto">
                            <Main />
                        </View>
                        <View gridArea="footer" backgroundColor="gray-50" borderColor="gray-200" borderTopWidth={1}>
                        </View>
                    </Grid>
                </RomDataProvider>
            </View>
        </SpectrumProvider>
    </RootProvider>
}
