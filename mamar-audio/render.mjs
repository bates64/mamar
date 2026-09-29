// Renders a song from a Paper Mario ROM to a WAV file, to check the engine by ear.
// Usage: node render.mjs <rom.z64> <song ID> <seconds> <out.wav>
import { readFileSync, writeFileSync } from "node:fs"

const [romPath, songIdArg, secondsArg, outPath] = process.argv.slice(2)
const rom = readFileSync(romPath)
const songId = Number(songIdArg)
const seconds = Number(secondsArg)

const sbnStart = rom.indexOf("SBN ")
const fileCount = rom.readUInt32BE(sbnStart + 0x14)
const initStart = sbnStart + rom.readUInt32BE(sbnStart + 0x24)
const songList = initStart + rom.readUInt16BE(initStart + 0x0C)
const bgmFileIndex = rom.readUInt16BE(songList + songId * 8)
if (bgmFileIndex >= fileCount) throw new Error(`song ${songId} has no BGM file`)
const entry = sbnStart + 0x40 + bgmFileIndex * 8
const bgmStart = sbnStart + (rom.readUInt32BE(entry) & 0xFFFFFF)
const bgm = rom.subarray(bgmStart, bgmStart + rom.readUInt32BE(bgmStart + 4))
const sbn = rom.subarray(sbnStart, sbnStart + rom.readUInt32BE(sbnStart + 4))

let memory
const { instance } = await WebAssembly.instantiate(readFileSync(new URL("build/mamar_audio.wasm", import.meta.url)), {
    env: {
        sbn_read(addr, dst, size) {
            new Uint8Array(memory.buffer, dst, size).set(sbn.subarray(addr, addr + size))
        },
    },
})
memory = instance.exports.memory
const audio = instance.exports

audio.mamar_audio_init()
new Uint8Array(memory.buffer, audio.mamar_audio_bgm_buffer(), bgm.length).set(bgm)
audio.mamar_audio_play(bgm.length, 0, songId, 0, 0)

const out = audio.mamar_audio_output()
const chunks = []
let frames = 0
while (frames < seconds * 32000) {
    const n = audio.mamar_audio_render_frame()
    chunks.push(Buffer.from(new Int16Array(memory.buffer, out, n * 2).slice().buffer))
    frames += n
}

const data = Buffer.concat(chunks)
const header = Buffer.alloc(44)
header.write("RIFF", 0)
header.writeUInt32LE(36 + data.length, 4)
header.write("WAVEfmt ", 8)
header.writeUInt32LE(16, 16)
header.writeUInt16LE(1, 20)
header.writeUInt16LE(2, 22)
header.writeUInt32LE(32000, 24)
header.writeUInt32LE(32000 * 4, 28)
header.writeUInt16LE(4, 32)
header.writeUInt16LE(16, 34)
header.write("data", 36)
header.writeUInt32LE(data.length, 40)
writeFileSync(outPath, Buffer.concat([header, data]))
console.log(`segment ${audio.mamar_audio_segment()}, tick ${audio.mamar_audio_tick()}`)
