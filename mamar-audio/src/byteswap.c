// The engine reads its files in place, as the big-endian N64 does. WebAssembly is little-endian, so each file's
// multi-byte fields are swapped to native order as they're read, working out where the fields are from the file's
// layout. Byte data, such as BGM command streams and ADPCM samples, is left as it is.
#include "glue.h"

// A file in the big-endian layout the ROM stores it in, read from memory or, if `mem` is null, from the ROM.
typedef struct {
    const u8* mem;
    u32 romAddr;
    u32 size;
} Source;

static u8 rd8(const Source* src, u32 offset) {
    u8 value = 0;
    if (offset >= src->size) {
        return 0;
    }
    if (src->mem != nullptr) {
        return src->mem[offset];
    }
    host_rom_read(src->romAddr + offset, &value, 1);
    return value;
}

static u16 rd16(const Source* src, u32 offset) {
    return (rd8(src, offset) << 8) | rd8(src, offset + 1);
}

static u32 rd32(const Source* src, u32 offset) {
    return ((u32)rd16(src, offset) << 16) | rd16(src, offset + 2);
}

// The width of the field starting at each byte of the part of the file being swapped, or 0 for none.
// Marking a field instead of swapping it straight away means a field reached twice is still only swapped once.
static u8 Widths[MAMAR_READ_MAX];
static u32 WidthsStart;
static u32 WidthsEnd;

static void mark(u32 offset, u8 width) {
    if (offset >= WidthsStart && offset + width <= WidthsEnd) {
        Widths[offset - WidthsStart] = width;
    }
}

static void mark16s(u32 offset, u32 size) {
    for (u32 i = 0; i + 2 <= size; i += 2) {
        mark(offset + i, 2);
    }
}

static void mark32s(u32 offset, u32 size) {
    for (u32 i = 0; i + 4 <= size; i += 4) {
        mark(offset + i, 4);
    }
}

static void mark_bgm(const Source* src) {
    u32 drums = rd16(src, 0x1C) << 2;
    u32 drumCount = rd16(src, 0x1E);
    u32 instruments = rd16(src, 0x20) << 2;
    u32 instrumentCount = rd16(src, 0x22);

    mark32s(0, 0x10);
    mark16s(0x14, 0x10);

    for (u32 i = 0; i < 4; i++) {
        u32 start = rd16(src, 0x14 + i * 2) << 2;

        if (start == 0) {
            continue;
        }
        for (u32 pos = start; pos < src->size; pos += 4) {
            u32 cmd = rd32(src, pos);

            mark(pos, 4);
            if (cmd == BGM_COMP_END) {
                break;
            }
            if ((cmd >> 28) == BGM_COMP_PLAY_PHRASE) {
                mark32s(start + ((cmd & 0xFFFF) << 2), 16 * 4);
            }
        }
    }

    for (u32 i = 0; i < drumCount; i++) {
        mark16s(drums + i * sizeof(BGMDrumInfo), 4);
    }
    for (u32 i = 0; i < instrumentCount; i++) {
        mark(instruments + i * sizeof(BGMInstrumentInfo), 2);
    }
}

static void mark_bk(const Source* src) {
    mark(0x00, 2);
    mark32s(0x04, 8);
    mark(0x0C, 2);
    mark16s(0x12, 0x40 - 0x12);

    for (u32 i = 0; i < 16; i++) {
        u32 instrument = rd16(src, 0x12 + i * 2);
        u32 envelopes;

        if (instrument == 0) {
            continue;
        }
        mark32s(instrument, 0x1C);
        mark16s(instrument + 0x1C, 4);
        mark(instrument + 0x20, 4);
        mark(instrument + 0x2C, 4);

        envelopes = rd32(src, instrument + 0x2C);
        if (envelopes != 0) {
            mark16s(envelopes + 4, rd8(src, envelopes) * sizeof(EnvelopeOffset));
        }
    }

    // Loop states and predictor codebooks are arrays of s16
    mark16s(rd16(src, 0x34), rd16(src, 0x36));
    mark16s(rd16(src, 0x38), rd16(src, 0x3A));
}

static void mark_sbn(const Source* src) {
    mark32s(0, sizeof(SBNHeader) + rd32(src, 0x14) * sizeof(SBNFileEntry));
}

static void mark_init(const Source* src) {
    u32 bankList = rd16(src, 0x08);
    u32 bankListSize = rd16(src, 0x0A);

    mark32s(0, 8);
    mark16s(0x08, 0x0C);
    for (u32 i = 0; i < bankListSize; i += sizeof(InitBankEntry)) {
        mark(bankList + i, 2);
    }
    mark16s(rd16(src, 0x0C), rd16(src, 0x0E));
    mark16s(rd16(src, 0x10), rd16(src, 0x12));
}

static void mark_file(const Source* src) {
    u32 signature = rd32(src, 0);

    switch (signature) {
        case ASCII_TO_U32('S', 'B', 'N', ' '):
            mark_sbn(src);
            break;
        case ASCII_TO_U32('I', 'N', 'I', 'T'):
            mark_init(src);
            break;
        case ASCII_TO_U32('B', 'G', 'M', ' '):
            mark_bgm(src);
            break;
        case ASCII_TO_U32('P', 'E', 'R', ' '):
            mark32s(0, 8);
            for (u32 i = sizeof(PERHeader); i < src->size; i += sizeof(BGMDrumInfo)) {
                mark16s(i, 4);
            }
            break;
        case ASCII_TO_U32('P', 'R', 'G', ' '):
            mark32s(0, 8);
            for (u32 i = sizeof(PERHeader); i < src->size; i += sizeof(BGMInstrumentInfo)) {
                mark(i, 2);
            }
            break;
        case ASCII_TO_U32('S', 'E', 'F', ' '):
            mark32s(0, 0xC);
            mark16s(0x10, 0x12);
            break;
        case ASCII_TO_U32('M', 'S', 'E', 'Q'):
            mark32s(0, 0xC);
            mark16s(0x0E, 4);
            break;
        default:
            // BK files start with a 16-bit signature
            if ((signature >> 16) == ASCII_TO_U32(0, 0, 'B', 'K')) {
                mark_bk(src);
            }
            break;
    }
}

// Swaps `buf`, which holds `size` bytes read from `offset` into the file `src`.
static void swap_read(const Source* src, u32 offset, u8* buf, u32 size) {
    if (size > MAMAR_READ_MAX) {
        size = MAMAR_READ_MAX;
    }

    WidthsStart = offset;
    WidthsEnd = offset + size;
    memset(Widths, 0, size);
    mark_file(src);

    for (u32 i = 0; i < size; i++) {
        u8 tmp;

        switch (Widths[i]) {
            case 2:
                tmp = buf[i];
                buf[i] = buf[i + 1];
                buf[i + 1] = tmp;
                break;
            case 4:
                tmp = buf[i];
                buf[i] = buf[i + 3];
                buf[i + 3] = tmp;
                tmp = buf[i + 1];
                buf[i + 1] = buf[i + 2];
                buf[i + 2] = tmp;
                break;
        }
    }
}

typedef struct {
    u32 romAddr;
    u32 size;
} RomFile;

static RomFile Files[0x400];
static u32 FileCount;

void mamar_find_files(void) {
    Source sbn = { nullptr, 0, sizeof(SBNHeader) };
    u32 count = rd32(&sbn, 0x14);
    u32 initOffset = rd32(&sbn, 0x24);

    sbn.size = sizeof(SBNHeader) + count * sizeof(SBNFileEntry);
    FileCount = 0;
    Files[FileCount++] = (RomFile) { 0, sbn.size };

    if (initOffset != 0) {
        Source init = { nullptr, initOffset, 8 };
        Files[FileCount++] = (RomFile) { init.romAddr, rd32(&init, 4) };
    }

    for (u32 i = 0; i < count && FileCount < ARRAY_COUNT(Files); i++) {
        u32 offset = rd32(&sbn, sizeof(SBNHeader) + i * sizeof(SBNFileEntry)) & 0xFFFFFF;
        u32 data = rd32(&sbn, sizeof(SBNHeader) + i * sizeof(SBNFileEntry) + 4);

        if (offset == 0) {
            break;
        }
        Files[FileCount++] = (RomFile) { offset, data & 0xFFFFFF };
    }
}

void mamar_swap_sbn_read(u32 romAddr, u8* buf, u32 size) {
    for (u32 i = 0; i < FileCount; i++) {
        RomFile* file = &Files[i];

        if (romAddr >= file->romAddr && romAddr < file->romAddr + file->size) {
            Source src = { nullptr, file->romAddr, file->size };
            swap_read(&src, romAddr - file->romAddr, buf, size);
            return;
        }
    }
}

void mamar_swap_bgm(const u8* bgm, u32 size, u8* out) {
    Source src = { bgm, 0, size };

    for (u32 offset = 0; offset < size; offset += MAMAR_READ_MAX) {
        u32 chunk = MIN(size - offset, MAMAR_READ_MAX);
        swap_read(&src, offset, out + offset, chunk);
    }
}

void dx_mamar_swap_seq_args(SeqArgs* args, u8 opcode) {
    u8* raw = args->raw;
    u8 tmp;

    switch (opcode) {
        case 0xE4: // masterTempoFade: time, value
            tmp = raw[2];
            raw[2] = raw[3];
            raw[3] = tmp;
            [[fallthrough]];
        case 0xE0: // masterTempo
        case 0xE5: // masterVolumeFade
        case 0xEF: // trackDetune
        case 0xF6: // trackVolumeFade
        case 0xFC: // branch
        case 0xFE: // detour
            tmp = raw[0];
            raw[0] = raw[1];
            raw[1] = tmp;
            break;
        case 0xFD: // eventTrigger
            args->eventTrigger.eventInfo = (raw[0] << 24) | (raw[1] << 16) | (raw[2] << 8) | raw[3];
            break;
    }
}
