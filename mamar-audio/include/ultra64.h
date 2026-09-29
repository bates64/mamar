// Stands in for libultra's ultra64.h, with only what papermario-dx's audio engine uses.
#ifndef _ULTRA64_H_
#define _ULTRA64_H_

#include <stdbool.h>
#include <stddef.h>
#include "PR/ultratypes.h"

typedef s32 b32;
typedef s16 b16;
typedef s8 b8;

// WebAssembly has one address space, so an address is its own physical address.
#define K0_TO_PHYS(x) ((u32)(x))
#define osVirtualToPhysical(x) ((u32)(x))

#endif
