import { EmulatorControls } from "mupen64plus-web"

export default class DramView {
    u8: Uint8Array

    constructor(emu: EmulatorControls) {
        this.u8 = emu.getDram()
    }

    readU8(address: number) {
        address = address & 0x00FFFFFF
        return this.u8[address]
    }

    writeU8(address: number, data: Uint8Array | number) {
        address = address & 0x00FFFFFF
        if (typeof data === "number") {
            this.u8[address] = data
        } else {
            for (let i = 0; i < data.length; i++) {
                this.u8[address + i] = data[i]
            }
        }
    }

    readU32(address: number) {
        address = address & 0x00FFFFFF
        return this.u8[address] | (this.u8[address + 1] << 8) | (this.u8[address + 2] << 16) | (this.u8[address + 3] << 24)
    }

    writeU32(address: number, data: Uint32Array | number) {
        address = address & 0x00FFFFFF
        if (typeof data === "number") {
            this.u8[address] = data & 0xFF
            this.u8[address + 1] = (data >> 8) & 0xFF
            this.u8[address + 2] = (data >> 16) & 0xFF
            this.u8[address + 3] = (data >> 24) & 0xFF
        } else {
            for (let i = 0; i < data.length; i++) {
                this.u8[address + i * 4] = data[i] & 0xFF
                this.u8[address + i * 4 + 1] = (data[i] >> 8) & 0xFF
                this.u8[address + i * 4 + 2] = (data[i] >> 16) & 0xFF
                this.u8[address + i * 4 + 3] = (data[i] >> 24) & 0xFF
            }
        }
    }
}
