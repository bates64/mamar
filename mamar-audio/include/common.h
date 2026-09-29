// Stands in for papermario-dx's include/common.h, with only what its audio engine uses.
#ifndef _COMMON_H_
#define _COMMON_H_

#include "ultra64.h"
#include "enums.h"

#define BSS
#define ALIGNED(n) __attribute__((aligned(n)))
#define UNUSED __attribute__((unused))
#define ARRAY_COUNT(arr) (s32)(sizeof(arr) / sizeof(arr[0]))
#define SQ(x) ((x) * (x))
#define CLAMP(x, min, max) ((x) < (min) ? (min) : (x) > (max) ? (max) : (x))
#define MIN(a, b) ((a) < (b) ? (a) : (b))
#define MAX(a, b) ((a) > (b) ? (a) : (b))
#define ABS(x) ((x) < 0 ? -(x) : (x))
#define ALIGN16(val) (((val) + 0xF) & ~0xF)
#define ASCII_TO_U32(a, b, c, d) ((u32)((a << 24) | (b << 16) | (c << 8) | (d << 0)))
#define _PAD_CONCAT2(a, b) a##b
#define _PAD_CONCAT(a, b) _PAD_CONCAT2(a, b)
#define PAD(n) u8 _PAD_CONCAT(pad_, __COUNTER__)[n]

#define VERSION_PAL 0
#define VERSION_IQUE 0

typedef f32 Vec3f[3];
typedef void (*AuCallback)(void);
typedef u32 MusicEventTrigger;

#include "audio.h"

#endif
