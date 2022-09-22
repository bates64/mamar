import * as WasmBridge from "mamar-wasm-bridge"
import * as React from "react"
import * as ReactDOM from "react-dom/client"

import App from "./App"

const rootEl = document.getElementById("root") as HTMLElement
const root = ReactDOM.createRoot(rootEl)

const loading = <div dangerouslySetInnerHTML={{ __html: rootEl.innerHTML }} />

class ErrorBoundary extends React.Component {
    state = { hasError: false }

    static getDerivedStateFromError() {
        return { hasError: true }
    }

    render() {
        if (this.state.hasError) {
            return <main className="initial-load-container">
                <div>
                    <h1>Something went wrong.</h1>
                    <p>
                        An error occurred whilst rendering Mamar.
                    </p>
                </div>
            </main>
        }

        return <React.Suspense fallback={loading}>
            <App />
        </React.Suspense>
    }
}

WasmBridge.default().then(() => {
    WasmBridge.init_logging()
    root.render(<ErrorBoundary />)
})

if (process.env.NODE_ENV !== "production") {
    import("@axe-core/react").then(axe => axe(React, ReactDOM, 1000))
}
