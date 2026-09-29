// Stands in for NuSystem's nualsgi.h, with only what papermario-dx's audio engine uses.
#ifndef _NUALSGI_H_
#define _NUALSGI_H_
#include "ultra64.h"
#include "PR/libaudio.h"

typedef struct {
    ALLink node;
    s32 startAddr;
    s32 frameCnt;
    char* ptr;
} NUDMABuffer;

typedef struct {
    u8 initialized;
    NUDMABuffer* firstUsed;
    NUDMABuffer* firstFree;
} NUDMAState;

ALDMAproc nuAuDmaNew(NUDMAState** state);
#endif
