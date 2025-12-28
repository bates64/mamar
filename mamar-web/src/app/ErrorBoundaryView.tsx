import { Flex, View, ViewProps } from "@adobe/react-spectrum"
import AlertCircleFilled from "@spectrum-icons/workflow/AlertCircleFilled"
import { Component } from "react"

export default class ErrorBoundaryView extends Component<ViewProps<5>> {
    state: { error: any } = { error: null }

    static getDerivedStateFromError(error: any) {
        return { error }
    }

    render() {
        const { children, ...props } = this.props

        if (this.state.error) {
            return <View {...props}>
                <Flex
                    direction="column"
                    alignItems="center"
                    justifyContent="center"
                    width="100%"
                    height="100%"
                >
                    <div style={{ textAlign: "center", color: "var(--spectrum-global-color-red-400)" }}>
                        <h1>
                            <AlertCircleFilled size="S" /> An error occurred
                        </h1>
                        <code>
                            {this.state.error.toString()}
                        </code>
                    </div>
                </Flex>
            </View>
        }

        return <View {...props}>
            {children}
        </View>
    }
}
