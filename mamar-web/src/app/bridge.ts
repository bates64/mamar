// Proxy for mamar-wasm-bridge with hot reloading

import type * as WasmBridgeTypes from "mamar-wasm-bridge"

let current: typeof WasmBridgeTypes | null = null

const bridge = new Proxy({}, {
    get(_target, prop) {
        if (!current) throw new Error("WASM bridge not loaded yet")
        const value = (current as any)[prop]
        return typeof value === "function" ? value.bind(current) : value
    },
}) as typeof WasmBridgeTypes

async function load(mod: typeof WasmBridgeTypes) {
    await mod.default()
    //mod.init_logging?.()
    current = mod as typeof WasmBridgeTypes
    return current
}

export async function ensureBridge() {
    return current ?? load(await import("mamar-wasm-bridge"))
}

if (import.meta.hot) {
    import.meta.hot.accept("mamar-wasm-bridge", async mod => {
        if (mod) {
            await load(mod as any)
        }
    })
}

export default bridge
