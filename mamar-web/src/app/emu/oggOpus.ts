// Encodes audio as Opus in an Ogg file (RFC 7845), with the browser's WebCodecs encoder, which has no container of its
// own to write it in.

/** The rate Opus encodes at, which audio is resampled to first. */
const OPUS_RATE = 48000

/** How many bits a second the audio is encoded at, unless that would make the file larger than `MAX_SIZE`. */
const BITRATE = 160_000

/** The quietest bitrate a long song is encoded at, below which Opus sounds poor for music. */
const MIN_BITRATE = 48_000

/**
 * The largest a file should be, in bytes, so it can be shared where uploads are limited to 20 MB, such as on Discord,
 * whichever way a megabyte is counted. It leaves some room below that for the Ogg pages and for the encoder going over
 * its bitrate.
 */
const MAX_SIZE = 18 * 1024 * 1024

/** How many samples the encoder delays its output by, as libopus does at 48 kHz, for players to skip. */
const DEFAULT_PRE_SKIP = 312

/** How many samples each piece of audio given to the encoder is. */
const SAMPLES_PER_CHUNK = 48000

const CONFIG: AudioEncoderConfig = { codec: "opus", sampleRate: OPUS_RATE, numberOfChannels: 2, bitrate: BITRATE }

/** Whether the browser can encode Opus, which it needs WebCodecs for. */
export async function canEncodeOpus(): Promise<boolean> {
    try {
        return typeof AudioEncoder !== "undefined" && (await AudioEncoder.isConfigSupported(CONFIG)).supported === true
    } catch {
        return false
    }
}

/** `samples`, interleaved stereo 16-bit samples at `rate` Hz, resampled to Opus's rate as a channel each. */
async function resample(samples: Int16Array, rate: number): Promise<AudioBuffer> {
    const frames = samples.length / 2
    const source = new AudioBuffer({ length: Math.max(1, frames), numberOfChannels: 2, sampleRate: rate })
    for (let channel = 0; channel < 2; channel++) {
        const data = source.getChannelData(channel)
        for (let i = 0; i < frames; i++) {
            data[i] = samples[i * 2 + channel] / 0x8000
        }
    }
    const context = new OfflineAudioContext(2, Math.max(1, Math.ceil(frames * OPUS_RATE / rate)), OPUS_RATE)
    const node = context.createBufferSource()
    node.buffer = source
    node.connect(context.destination)
    node.start()
    return context.startRendering()
}

/** Encodes `audio` as Opus packets, each with how many samples it plays for, and the stream's identification header. */
/** The bitrate to encode `seconds` of audio at, as high as it can be while the file fits in `MAX_SIZE`. */
function bitrateFor(seconds: number): number {
    return Math.round(Math.max(MIN_BITRATE, Math.min(BITRATE, MAX_SIZE * 8 / Math.max(1, seconds))))
}

async function encode(audio: AudioBuffer, bitrate: number): Promise<{ packets: { data: Uint8Array, samples: number }[], head: Uint8Array | null }> {
    const packets: { data: Uint8Array, samples: number }[] = []
    let head: Uint8Array | null = null
    let failure: DOMException | null = null
    const encoder = new AudioEncoder({
        output: (chunk, metadata) => {
            const data = new Uint8Array(chunk.byteLength)
            chunk.copyTo(data)
            packets.push({ data, samples: Math.round((chunk.duration ?? 20_000) * OPUS_RATE / 1e6) })
            const description = metadata?.decoderConfig?.description
            if (!head && description) {
                head = new Uint8Array(ArrayBuffer.isView(description) ? description.buffer : description)
            }
        },
        error: error => {
            failure = error
        },
    })
    encoder.configure({ ...CONFIG, bitrate })

    const left = audio.getChannelData(0)
    const right = audio.getChannelData(1)
    for (let start = 0; start < audio.length; start += SAMPLES_PER_CHUNK) {
        const frames = Math.min(SAMPLES_PER_CHUNK, audio.length - start)
        const data = new Float32Array(frames * 2)
        data.set(left.subarray(start, start + frames), 0)
        data.set(right.subarray(start, start + frames), frames)
        encoder.encode(new AudioData({
            format: "f32-planar",
            sampleRate: OPUS_RATE,
            numberOfFrames: frames,
            numberOfChannels: 2,
            timestamp: Math.round(start * 1e6 / OPUS_RATE),
            data,
        }))
    }
    await encoder.flush()
    encoder.close()
    if (failure) {
        throw failure
    }
    return { packets, head }
}

/** The identification header of a stereo Opus stream (RFC 7845 section 5.1). */
function opusHead(inputRate: number): Uint8Array {
    const head = new Uint8Array(19)
    const view = new DataView(head.buffer)
    head.set(new TextEncoder().encode("OpusHead"))
    view.setUint8(8, 1) // version
    view.setUint8(9, 2) // channels
    view.setUint16(10, DEFAULT_PRE_SKIP, true)
    view.setUint32(12, inputRate, true)
    view.setInt16(16, 0, true) // output gain
    view.setUint8(18, 0) // mapping family: mono or stereo
    return head
}

/** The comment header of an Opus stream (RFC 7845 section 5.2), which names the encoder and has no comments. */
function opusTags(): Uint8Array {
    const vendor = new TextEncoder().encode("Mamar")
    const tags = new Uint8Array(8 + 4 + vendor.length + 4)
    const view = new DataView(tags.buffer)
    tags.set(new TextEncoder().encode("OpusTags"))
    view.setUint32(8, vendor.length, true)
    tags.set(vendor, 12)
    view.setUint32(12 + vendor.length, 0, true)
    return tags
}

const CRC_TABLE = (() => {
    const table = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
        let crc = i << 24
        for (let bit = 0; bit < 8; bit++) {
            crc = crc & 0x80000000 ? (crc << 1) ^ 0x04C11DB7 : crc << 1
        }
        table[i] = crc >>> 0
    }
    return table
})()

/** The checksum an Ogg page has of itself. */
function oggCrc(bytes: Uint8Array): number {
    let crc = 0
    for (const byte of bytes) {
        crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 0xFF]) >>> 0
    }
    return crc
}

/** Flags of an Ogg page's header. */
const BEGINNING_OF_STREAM = 0x02
const END_OF_STREAM = 0x04

/** An Ogg page of `packets`, whose last ends at sample `granule` of the stream. */
function oggPage(packets: Uint8Array[], granule: number, sequence: number, serial: number, flags: number): Uint8Array {
    // Each packet is laced in segments of 255 bytes, and one shorter to end it
    const lacing: number[] = []
    for (const packet of packets) {
        let left = packet.length
        while (left >= 255) {
            lacing.push(255)
            left -= 255
        }
        lacing.push(left)
    }
    const bodyLength = packets.reduce((sum, packet) => sum + packet.length, 0)
    const page = new Uint8Array(27 + lacing.length + bodyLength)
    const view = new DataView(page.buffer)
    page.set(new TextEncoder().encode("OggS"))
    view.setUint8(4, 0) // version
    view.setUint8(5, flags)
    view.setBigUint64(6, BigInt(granule), true)
    view.setUint32(14, serial, true)
    view.setUint32(18, sequence, true)
    view.setUint8(26, lacing.length)
    page.set(lacing, 27)
    let offset = 27 + lacing.length
    for (const packet of packets) {
        page.set(packet, offset)
        offset += packet.length
    }
    view.setUint32(22, oggCrc(page), true)
    return page
}

/**
 * An Ogg Opus file of `samples`, interleaved stereo 16-bit samples at `rate` Hz, which it's resampled from to Opus's
 * rate. Players trim it to the samples' length. A song longer than about 15 minutes is encoded at a lower bitrate, so
 * the file stays under 20 MB.
 */
export async function encodeOggOpus(samples: Int16Array, rate: number): Promise<Blob> {
    const audio = await resample(samples, rate)
    // Encoders can go well over the bitrate they're given, so one that does goes again, as far under as it went over
    let bitrate = bitrateFor(audio.duration)
    for (let attempt = 0; ; attempt++) {
        const file = toOgg(audio, rate, await encode(audio, bitrate))
        if (file.size <= MAX_SIZE || bitrate <= MIN_BITRATE || attempt >= 3) {
            return file
        }
        bitrate = Math.max(MIN_BITRATE, Math.floor(bitrate * MAX_SIZE / file.size * 0.97))
    }
}

/** An Ogg file of the Opus packets encoded from `audio`, which was resampled from `rate` Hz. */
function toOgg(audio: AudioBuffer, rate: number, { packets, head: encoderHead }: Awaited<ReturnType<typeof encode>>): Blob {
    const head = encoderHead && new TextDecoder().decode(encoderHead.subarray(0, 8)) === "OpusHead" ? encoderHead : opusHead(rate)
    const preSkip = new DataView(head.buffer, head.byteOffset).getUint16(10, true)

    const serial = (Math.random() * 0xFFFFFFFF) >>> 0
    const pages: Uint8Array[] = [
        oggPage([head], 0, 0, serial, BEGINNING_OF_STREAM),
        oggPage([opusTags()], 0, 1, serial, 0),
    ]
    // Pages of about a second of packets, each no more than an Ogg page's 255 segments
    let granule = preSkip
    let page: Uint8Array[] = []
    let segments = 0
    const end = preSkip + audio.length
    packets.forEach(({ data, samples }, i) => {
        const needed = Math.floor(data.length / 255) + 1
        if (segments + needed > 255 || page.length >= 50) {
            pages.push(oggPage(page, Math.min(granule, end), pages.length, serial, 0))
            page = []
            segments = 0
        }
        page.push(data)
        segments += needed
        granule += samples
        if (i === packets.length - 1) {
            pages.push(oggPage(page, end, pages.length, serial, END_OF_STREAM))
        }
    })
    // A stream still ends with a page marking its end when it has no audio
    if (packets.length === 0) {
        pages.push(oggPage([], end, pages.length, serial, END_OF_STREAM))
    }
    return new Blob(pages as Uint8Array<ArrayBuffer>[], { type: "audio/ogg" })
}
