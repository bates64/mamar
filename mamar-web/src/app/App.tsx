import { Provider as SpectrumProvider, defaultTheme, Grid, View } from "@adobe/react-spectrum"

import DocTabs from "./DocTabs"
import Header from "./header/Header"
import { RootProvider } from "./store"

export default function App() {
    return <RootProvider>
        <SpectrumProvider theme={defaultTheme}>
            <View UNSAFE_className="App">
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
                    <View gridArea="content" overflow="auto">
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
