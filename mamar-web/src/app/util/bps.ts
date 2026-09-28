const CRC32_TABLE = new Uint32Array(256).map((_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    }
    return c
})

function crc32(data: Uint8Array): number {
    let crc = 0xFFFFFFFF
    for (let i = 0; i < data.length; i++) {
        crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)
    }
    return (crc ^ 0xFFFFFFFF) >>> 0
}

/** Applies a BPS patch, checking the source, the result, and the patch itself against the patch's checksums. */
export default function applyBps(source: Uint8Array, patch: Uint8Array): Uint8Array {
    const footer = new DataView(patch.buffer, patch.byteOffset + patch.length - 12, 12)
    if (String.fromCharCode(...patch.subarray(0, 4)) !== "BPS1") {
        throw new Error("Not a BPS patch")
    }
    if (crc32(patch.subarray(0, patch.length - 4)) !== footer.getUint32(8, true)) {
        throw new Error("The patch is damaged")
    }
    if (crc32(source) !== footer.getUint32(0, true)) {
        throw new Error("The ROM isn't the one the patch is for")
    }

    let offset = 4
    const readNumber = () => {
        let value = 0
        let shift = 1
        for (;;) {
            const byte = patch[offset++]
            value += (byte & 0x7F) * shift
            if (byte & 0x80) {
                return value
            }
            shift *= 128
            value += shift
        }
    }

    readNumber() // source size
    const target = new Uint8Array(readNumber())
    const metadataSize = readNumber()
    offset += metadataSize

    let outputOffset = 0
    let sourceRelative = 0
    let targetRelative = 0
    while (offset < patch.length - 12) {
        // These numbers can exceed 32 bits, which bitwise operators would truncate.
        const action = readNumber()
        const length = Math.floor(action / 4) + 1
        switch (action % 4) {
        case 0: // SourceRead
            target.set(source.subarray(outputOffset, outputOffset + length), outputOffset)
            outputOffset += length
            break
        case 1: // TargetRead
            target.set(patch.subarray(offset, offset + length), outputOffset)
            offset += length
            outputOffset += length
            break
        case 2: { // SourceCopy
            const delta = readNumber()
            sourceRelative += (delta % 2 ? -1 : 1) * Math.floor(delta / 2)
            target.set(source.subarray(sourceRelative, sourceRelative + length), outputOffset)
            sourceRelative += length
            outputOffset += length
            break
        }
        case 3: { // TargetCopy, which can overlap the bytes it's writing
            const delta = readNumber()
            targetRelative += (delta % 2 ? -1 : 1) * Math.floor(delta / 2)
            for (let i = 0; i < length; i++) {
                target[outputOffset++] = target[targetRelative++]
            }
            break
        }
        }
    }

    if (crc32(target) !== footer.getUint32(4, true)) {
        throw new Error("Patching the ROM failed")
    }
    return target
}
