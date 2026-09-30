// Stands in for the parts of the N64 and NuSystem that papermario-dx's audio engine uses: the ROM, the audio heap,
// DMA of samples, and the RSP, which mupen64plus's high-level emulation of the audio microcode replaces.
#include "glue.h"
#include "nu/nualsgi.h"
#include "rsp-hle/hle_internal.h"

u8 volatile AuSynUseStereo = true;
u32 nuAuFrameCounter = 0;

ALHeap nuAuHeap;
AuSynDriver auSynDriver;
u8 AuHeapBase[AUDIO_HEAP_SIZE] ALIGNED(16);

static Acmd* CmdList;
static s32 FrameSize;

// Each byte of RDRAM is at the same address in WebAssembly memory. This isn't a constant, as the compiler would
// otherwise treat arithmetic on the null pointer as undefined.
static u32 DramBase = 0;
static struct hle_t Hle;
static u8 Dmem[0x1000] ALIGNED(8);
static u8 Imem[0x1000] ALIGNED(8);
static u32 HleRegister;

void* memcpy(void* dst, const void* src, size_t n) {
    u8* d = dst;
    const u8* s = src;

    while (n--) {
        *d++ = *s++;
    }
    return dst;
}

void* memmove(void* dst, const void* src, size_t n) {
    u8* d = dst;
    const u8* s = src;

    if (d < s) {
        return memcpy(dst, src, n);
    }
    while (n--) {
        d[n] = s[n];
    }
    return dst;
}

void* memset(void* dst, int value, size_t n) {
    u8* d = dst;

    while (n--) {
        *d++ = value;
    }
    return dst;
}


void alLink(ALLink* element, ALLink* after) {
    element->next = after->next;
    element->prev = after;

    if (after->next != nullptr) {
        after->next->prev = element;
    }
    after->next = element;
}

void alUnlink(ALLink* element) {
    if (element->next != nullptr) {
        element->next->prev = element->prev;
    }

    if (element->prev != nullptr) {
        element->prev->next = element->next;
    }
}

void nuPiReadRom(u32 romAddr, void* buf, u32 size) {
    host_rom_read(romAddr, buf, size);
    mamar_swap_sbn_read(romAddr, buf, size);
}

// Samples are read from ROM as they're needed, into buffers that are recycled once no frame has used them for a
// while. A frame's command list reads from these buffers after every voice has asked for its samples.
static NUDMAState nuAuDmaState;
static NUDMABuffer nuAuDmaBufList[50];
static u8 DmaBufferData[ARRAY_COUNT(nuAuDmaBufList)][0x500] ALIGNED(16);

s32 nuAuDmaCallBack(s32 addr, s32 len, void* state, u8 useDma) {
    NUDMABuffer* dmaPtr;
    NUDMABuffer* lastDmaPtr = nullptr;
    u8* freeBuffer;
    s32 delta;
    s32 addrEnd = addr + len;

    if (!useDma) {
        return addr;
    }

    for (dmaPtr = nuAuDmaState.firstUsed; dmaPtr != nullptr; dmaPtr = (NUDMABuffer*)dmaPtr->node.next) {
        if (addr >= dmaPtr->startAddr && dmaPtr->startAddr + 0x500 >= addrEnd) {
            dmaPtr->frameCnt = nuAuFrameCounter;
            return (s32)(dmaPtr->ptr + addr - dmaPtr->startAddr);
        } else if (addr < dmaPtr->startAddr) {
            break;
        }
        lastDmaPtr = dmaPtr;
    }

    dmaPtr = nuAuDmaState.firstFree;
    if (dmaPtr == nullptr) {
        return (s32)nuAuDmaState.firstUsed;
    }

    nuAuDmaState.firstFree = (NUDMABuffer*)dmaPtr->node.next;
    alUnlink(&dmaPtr->node);

    if (lastDmaPtr != nullptr) {
        alLink(&dmaPtr->node, &lastDmaPtr->node);
    } else if (nuAuDmaState.firstUsed != nullptr) {
        lastDmaPtr = nuAuDmaState.firstUsed;
        nuAuDmaState.firstUsed = dmaPtr;
        dmaPtr->node.next = &lastDmaPtr->node;
        dmaPtr->node.prev = nullptr;
        lastDmaPtr->node.prev = &dmaPtr->node;
    } else {
        nuAuDmaState.firstUsed = dmaPtr;
        dmaPtr->node.next = nullptr;
        dmaPtr->node.prev = nullptr;
    }

    freeBuffer = (u8*)dmaPtr->ptr;
    delta = addr & 1;
    addr -= delta;
    dmaPtr->startAddr = addr;
    dmaPtr->frameCnt = nuAuFrameCounter;
    host_rom_read(addr, freeBuffer, 0x500);
    return (s32)freeBuffer + delta;
}

ALDMAproc nuAuDmaNew(NUDMAState** state) {
    if (!nuAuDmaState.initialized) {
        nuAuDmaBufList[0].node.next = nuAuDmaBufList[0].node.prev = nullptr;
        for (s32 i = 0; i < ARRAY_COUNT(nuAuDmaBufList); i++) {
            if (i > 0) {
                alLink(&nuAuDmaBufList[i].node, &nuAuDmaBufList[i - 1].node);
            }
            nuAuDmaBufList[i].ptr = (char*)DmaBufferData[i];
        }
        nuAuDmaState.firstFree = &nuAuDmaBufList[0];
        nuAuDmaState.firstUsed = nullptr;
        nuAuDmaState.initialized = true;
    }

    *state = &nuAuDmaState;
    return (ALDMAproc)nuAuDmaCallBack;
}

static void nuAuCleanDMABuffers(void) {
    NUDMAState* state = &nuAuDmaState;
    NUDMABuffer* dmaPtr = state->firstUsed;

    while (dmaPtr != nullptr) {
        NUDMABuffer* nextPtr = (NUDMABuffer*)dmaPtr->node.next;

        if (dmaPtr->frameCnt + 1 < nuAuFrameCounter) {
            if (state->firstUsed == dmaPtr) {
                state->firstUsed = nextPtr;
            }

            alUnlink(&dmaPtr->node);

            if (state->firstFree != nullptr) {
                alLink(&dmaPtr->node, &state->firstFree->node);
            } else {
                state->firstFree = dmaPtr;
                dmaPtr->node.next = nullptr;
                dmaPtr->node.prev = nullptr;
            }
        }

        dmaPtr = nextPtr;
    }

    nuAuFrameCounter++;
}

void rsp_break(struct hle_t* hle, unsigned int setbits) {
}

void HleVerboseMessage(void* user_defined, const char* message, ...) {
}

void HleInfoMessage(void* user_defined, const char* message, ...) {
}

void HleErrorMessage(void* user_defined, const char* message, ...) {
}

void HleWarnMessage(void* user_defined, const char* message, ...) {
}

void alist_process_naudio(struct hle_t* hle);
Acmd* alAudioFrame(Acmd* cmdList, s32* cmdLen, s16* outBuf, s32 outLen);

/// Starts the engine, reading the sound bank (SBN) from the host.
__attribute__((export_name("mamar_audio_init")))
void mamar_audio_init(void) {
    ALConfig config;

    mamar_find_files();

    Hle.dram = (u8*)DramBase;
    Hle.dmem = Dmem;
    Hle.imem = Imem;
    Hle.mi_intr = &HleRegister;
    Hle.sp_status = &HleRegister;

    alHeapInit(&nuAuHeap, AuHeapBase, AUDIO_HEAP_SIZE);
    config.numPvoice = 24;
    config.numBus = 4;
    config.outputRate = HARDWARE_OUTPUT_RATE;
    config.unused_0C = 0;
    config.heap = &nuAuHeap;
    config.dmaNew = (ALDMANew2)nuAuDmaNew;
    CmdList = alHeapAlloc(config.heap, 1, AUDIO_COMMAND_LIST_BUFFER_SIZE);
    au_driver_init(&auSynDriver, &config);
    au_engine_init(config.outputRate);
}

// Stereo samples of the latest frame, which is at most two audio frames of the N64's
static s16 Output[AUDIO_MAX_SAMPLES * 2 * 2] ALIGNED(16);

/// Where `mamar_audio_render_frame` writes its interleaved stereo samples.
__attribute__((export_name("mamar_audio_output")))
s16* mamar_audio_output(void) {
    return Output;
}

/// Renders one video frame of audio into `Output`, and returns how many sample frames it wrote.
/// Frames alternate between lengths so that, as on the N64, they average 32000 / 60 samples.
__attribute__((export_name("mamar_audio_render_frame")))
s32 mamar_audio_render_frame(void) {
    static s32 owed = 0;
    s32 samples;
    s32 cmdLen;
    Acmd* cmdEnd;

    owed += HARDWARE_OUTPUT_RATE;
    samples = (owed / 60 + AUDIO_SAMPLES - 1) / AUDIO_SAMPLES * AUDIO_SAMPLES;
    samples = MIN(samples, AUDIO_MAX_SAMPLES * 2);
    owed -= samples * 60;

    mamar_update_song();
    cmdEnd = alAudioFrame(CmdList, &cmdLen, Output, samples);
    if (cmdLen == 0) {
        memset(Output, 0, samples * 4);
        return samples;
    }

    *(u32*)&Dmem[0xFF0] = (u32)CmdList; // TASK_DATA_PTR
    *(u32*)&Dmem[0xFF4] = (cmdEnd - CmdList) * sizeof(Acmd); // TASK_DATA_SIZE
    alist_process_naudio(&Hle);
    mamar_finish_mix();
    nuAuCleanDMABuffers();
    return samples;
}
