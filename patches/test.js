// node test.js && cd papermario && ./diff.py state_step_logos; cd ..
// node test.js &&

const fs = require("fs")

const patches = require("./build/patches.js")

class Patcher {
    constructor(rom) {
        this.dv = new DataView(rom)
    }

    overwriteFunction(romAddr, dataU32) {
        for (let i = 0; i < dataU32.length; i++) {
            this.dv.setUint32(romAddr + i * 4, dataU32[i], false)
        }
    }
}

const rom = fs.readFileSync("/Users/alex/roms/papermario.z64").buffer
const patcher = new Patcher(rom)

patcher.overwriteFunction(0xF4A4, patches.skipIntroLogos)

//const out = "papermario/ver/us/build/papermario.z64"
const out = "../emulator_puppet/star-rod-mod/out/papermario.z64"
fs.writeFileSync(out, Buffer.from(rom))
