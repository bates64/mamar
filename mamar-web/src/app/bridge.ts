// Proxy for mamar-wasm-bridge with hot reloading

import type * as WasmBridgeTypes from "mamar-wasm-bridge"
import { getUntrackedObject } from "react-tracked"

let current: typeof WasmBridgeTypes | null = null

const bridge = new Proxy({}, {
    get(_target, prop) {
        if (!current) throw new Error("WASM bridge not loaded yet")
        const value = (current as any)[prop]
        // Classes, like PianoRoll, are constructed with `new`, which a wrapper function can't be
        if (typeof value !== "function" || /^class[\s{]/.test(Function.prototype.toString.call(value))) {
            return value
        }
        // Reading state through react-tracked's proxies to serialize it is slow, and would make the caller depend on
        // every value in it, so pass the objects underneath.
        return (...args: unknown[]) => value.apply(current, args.map(arg => getUntrackedObject(arg as object) ?? arg))
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
