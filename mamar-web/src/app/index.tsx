import * as React from "react"
import * as ReactDOM from "react-dom/client"

import "../service-worker-load.js"
import App from "./App"
import bridge, { ensureBridge } from "./bridge"

const rootEl = document.getElementById("root") as HTMLElement
const root = ReactDOM.createRoot(rootEl)

export const loading = <div dangerouslySetInnerHTML={{ __html: rootEl.innerHTML }} />

class ErrorBoundary extends React.Component {
    state: { error: any } = { error: null }

    static getDerivedStateFromError(error: any) {
        return { error }
    }

    render() {
        if (this.state.error) {
            const errorMessage = this.state.error.stack?.toString?.() || this.state.error.toString()

            return <main className="initial-load-container">
                <div>
                    <h1>Something went wrong.</h1>
                    <p>
                        An error occurred loading Mamar. If you think this is a bug, <a href="https://github.com/nanaian/mamar/issues/new">please report it</a>.
                    </p>
                    <p className="error-details">
                        {errorMessage}
                    </p>
                </div>
            </main>
        }

        return <React.Suspense fallback={loading}>
            <App />
        </React.Suspense>
    }
}

await ensureBridge()
bridge.init_logging()
root.render(<ErrorBoundary />)

if (import.meta.env.DEV) {
    import("@axe-core/react").then(({ default: axe }) => axe(React, ReactDOM, 1000))
}
