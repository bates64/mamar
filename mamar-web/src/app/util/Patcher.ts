export default class Patcher {
    dv: DataView

    constructor(rom: ArrayBuffer) {
        this.dv = new DataView(rom)
    }

    overwriteFunction(romAddr: number, dataU32: number[]) {
        for (let i = 0; i < dataU32.length; i++) {
            this.dv.setUint32(romAddr + i * 4, dataU32[i], false)
        }
    }
}
