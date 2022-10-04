#include "common.h"
#include "audio.h"
#include "audio/private.h"
#include "gcc/memory.h"

// inverse of AU_FILE_RELATIVE; returns offset from start of file
#define MAMAR_RELATIVE_OFFSET(base, addr) ((void*)((s32)(addr) - (s32)(base)))

u8 MAMAR_bgm[0x20000];
s32 MAMAR_bgm_size;
s32 MAMAR_bk_files[3];
s32 MAMAR_song_id;
s32 MAMAR_song_variation;
s32 MAMAR_ambient_sounds;
s32 MAMAR_trackMute[16]; // 0 = no mute, 1 = mute, 2 = solo

s32 MAMAR_out_masterTempo;
s32 MAMAR_out_segmentReadPos;
s32 MAMAR_out_trackReadPos[16];

void PATCH_state_step_logos(void) {
    set_game_mode(GAME_MODE_TITLE_SCREEN);
    play_ambient_sounds(AMBIENT_RADIO, 0);
}

void PATCH_state_step_title_screen(void) {
    s32 i;

    bgm_set_song(0, MAMAR_song_id, MAMAR_song_variation, 0, 8);
    play_ambient_sounds(MAMAR_ambient_sounds, 0);

    MAMAR_out_masterTempo = gBGMPlayerA->masterTempo;
    MAMAR_out_segmentReadPos = MAMAR_RELATIVE_OFFSET(gBGMPlayerA->bgmFile, gBGMPlayerA->segmentReadPos);
    for (i = 0; i < 16; i++) {
        if (gBGMPlayerA->tracks[i].bgmReadPos != NULL) {
            MAMAR_out_trackReadPos[i] = MAMAR_RELATIVE_OFFSET(gBGMPlayerA->bgmFile, gBGMPlayerA->tracks[i].bgmReadPos);
        } else {
            MAMAR_out_trackReadPos[i] = 0;
        }
    }

    // MAMAR_trackMute
    {
        s32 isAnySolo = 0;

        for (i = 0; i < 16; i++) {
            if (MAMAR_trackMute[i] == 2) {
                isAnySolo = 1;
                break;
            }
        }

        for (i = 0; i < 16; i++) {
            s32 volume = 0;

            if (MAMAR_trackMute[i] == 2) {
                volume = 100;
            } else if (MAMAR_trackMute[i] == 1 || isAnySolo) {
                volume = 0;
            } else {
                volume = 100;
            }

            func_80050888(gBGMPlayerA, &gBGMPlayerA->tracks[i], volume, 0);
        }
    }
}

void PATCH_appendGfx_title_screen(void) {
}

AuResult MAMAR_au_load_song_files(u32 songID, BGMHeader* bgmFile, BGMPlayer* player) {
    AuResult status;
    SBNFileEntry fileEntry;
    SBNFileEntry fileEntry2;
    SBNFileEntry* bkFileEntry;
    AuGlobals* soundData;
    InitSongEntry* songInfo;
    s32 i;
    u16 bkFileIndex;
    s32 bgmFileIndex;
    u32 data;
    u32 offset;

    soundData = gSoundGlobals;

    songInfo = &soundData->songList[songID];
    status = au_fetch_SBN_file(songInfo->bgmFileIndex, AU_FMT_BGM, &fileEntry);
    if (status != AU_RESULT_OK) {
        return status;
    }

    if (func_8004DB28(player)) {
        return AU_ERROR_201;
    }

    if (MAMAR_bgm_size > 0) {
        // Detect endianness of file
        s32 be = MAMAR_bgm[0] == 'B' && MAMAR_bgm[1] == 'G' && MAMAR_bgm[2] == 'M' && MAMAR_bgm[3] == ' ';
        s32 le = MAMAR_bgm[0] == ' ' && MAMAR_bgm[1] == 'M' && MAMAR_bgm[2] == 'G' && MAMAR_bgm[3] == 'B';

        if (be) {
            au_copy_bytes(MAMAR_bgm, bgmFile, MAMAR_bgm_size);
        } else if (le) {
            u8* dest = (u8*)bgmFile;
            u8* src = MAMAR_bgm;

            for (i = 0; i < MAMAR_bgm_size; i += 4) {
                dest[i + 0] = src[i + 3];
                dest[i + 1] = src[i + 2];
                dest[i + 2] = src[i + 1];
                dest[i + 3] = src[i + 0];
            }
        }

        // If the "BGM " signature is invalid, play an error song
        if (bgmFile->signature != 0x42474D20) {
            MAMAR_bgm_size = 0;
            return MAMAR_au_load_song_files(SONG_WHALE_THEME, bgmFile, player);
        }
    } else {
        au_read_rom(fileEntry.offset, bgmFile, fileEntry.data & 0xFFFFFF);
    }

    for (i = 0 ; i < ARRAY_COUNT(MAMAR_bk_files); i++) {
        bkFileIndex = MAMAR_bk_files[i];
        if (bkFileIndex != 0) {
            bkFileEntry = &soundData->sbnFileList[bkFileIndex];

            offset = (bkFileEntry->offset & 0xFFFFFF) + soundData->baseRomOffset;
            fileEntry2.offset = offset;

            data = bkFileEntry->data;
            fileEntry2.data = data;

            if ((data >> 0x18) == AU_FMT_BK) {
                snd_load_BK(offset, i);
            }
        }
    }
    player->songID = songID;
    player->bgmFile = bgmFile;
    player->bgmFileIndex = 0;
    return bgmFile->name;
}

AuResult PATCH_au_load_song_files(u32 songID, BGMHeader* bgmFile, BGMPlayer* player) {
    // It has jumps so we can't just use a hook
    return MAMAR_au_load_song_files(songID, bgmFile, player);
}
