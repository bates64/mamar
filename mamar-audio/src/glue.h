// Connects papermario-dx's audio engine to the WebAssembly host. The host provides the ROM's sound bank (SBN) as the
// engine's ROM, so a ROM address is an offset into the sound bank.
#ifndef MAMAR_GLUE_H
#define MAMAR_GLUE_H
#include "common.h"
#include "audio/audio.h"
#include "audio/core.h"

// The most bytes swapped in one read. The engine reads ROM in chunks of 0x2000.
#define MAMAR_READ_MAX 0x10000

__attribute__((import_module("env"), import_name("sbn_read")))
void host_rom_read(u32 romAddr, void* dst, u32 size);

#include <string.h>

void mamar_find_files(void);
void mamar_swap_sbn_read(u32 addr, u8* buf, u32 size);
void mamar_update_song(void);
void mamar_audio_stop(void);
void mamar_swap_bgm(const u8* bgm, u32 size, u8* out);
void mamar_finish_mix(void);
#endif
