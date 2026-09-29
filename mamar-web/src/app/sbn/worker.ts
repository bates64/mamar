import Bridge, { ensureBridge } from "../bridge"

await ensureBridge()
Bridge.init_logging?.()
postMessage("READY")

onmessage = evt => {
    const sbnData = evt.data as ArrayBuffer
    const sbn = Bridge.sbn_decode(new Uint8Array(sbnData))
    postMessage(sbn)
}
