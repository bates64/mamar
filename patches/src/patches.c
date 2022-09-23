#include "common.h"
#include "audio.h"
#include "gcc/memory.h"

s32 MAMAR_bgm[0x20000];
s32 MAMAR_bgm_size;
s32 MAMAR_bk_files[3];
s32 MAMAR_song_id;
s32 MAMAR_song_variation;
s32 MAMAR_ambient_sounds;

s32 MAMAR_out_masterTempo;

void PATCH_state_step_logos(void) {
    set_game_mode(GAME_MODE_TITLE_SCREEN);
    play_ambient_sounds(AMBIENT_RADIO, 0);
}

void PATCH_state_step_title_screen(void) {
    bgm_set_song(0, MAMAR_song_id, MAMAR_song_variation, 0, 8);
    play_ambient_sounds(MAMAR_ambient_sounds, 0);

    MAMAR_out_masterTempo = gBGMPlayerA->masterTempo;
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
        au_copy_bytes(MAMAR_bgm, bgmFile, MAMAR_bgm_size);

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
