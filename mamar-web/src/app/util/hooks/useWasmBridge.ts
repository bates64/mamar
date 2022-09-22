import load, { InitOutput, init } from "mamar-wasm-bridge"

const loadPromise = load()
let output: InitOutput
loadPromise.then(o => {
    output = o
    init()
}, console.error)

export default function useWasmBridge() {
    if (!output) {
        throw loadPromise
    }

    return output
}
