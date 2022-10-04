import * as WasmBridge from "mamar-wasm-bridge"

WasmBridge.default().then(() => {
    WasmBridge.init_logging()
    postMessage("READY")
})

onmessage = evt => {
    const romData = evt.data as ArrayBuffer
    const sbn = WasmBridge.sbn_decode(new Uint8Array(romData))
    postMessage(sbn)
}
