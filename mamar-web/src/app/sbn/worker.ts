import Bridge, { ensureBridge } from "../bridge"

await ensureBridge()
Bridge.init_logging?.()
postMessage("READY")

onmessage = evt => {
    const romData = evt.data as ArrayBuffer
    const sbn = Bridge.sbn_decode(new Uint8Array(romData))
    postMessage(sbn)
}
