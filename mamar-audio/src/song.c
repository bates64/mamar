// Plays the song the host writes into `MamarBGM`, in place of a song from the ROM.
#include "glue.h"

// Each BGM player's file buffer is 0x5000 bytes
#define MAMAR_BGM_MAX_SIZE 0x5000

static u8 MamarBGM[MAMAR_BGM_MAX_SIZE];
static s32 MamarBGMSize;
static s32 MamarBankSong = -1;
static s32 MamarStartSegment;
static s32 MamarStartTick;
static s32 MamarVariation;
static s32 PlayingSongName;
/// Whether to play the song in `MamarBGM` once the one playing has stopped.
static b32 IsPlayRequested;
static u32 ProximityMix;
static b32 AlternateParts;

b32 dx_mamar_load_song(BGMHeader* bgmFile, BGMPlayer* player, AuResult* result) {
    AuGlobals* globals = gSoundGlobals;

    if (MamarBGMSize == 0) {
        return false;
    }

    if (au_bgm_player_is_active(player)) {
        *result = AU_ERROR_201;
        return true;
    }

    memcpy(bgmFile, MamarBGM, MamarBGMSize);
    mamar_swap_bgm(MamarBGM, MamarBGMSize, (u8*)bgmFile);

    if (MamarBankSong >= 0 && MamarBankSong < globals->songListLength) {
        InitSongEntry* bankSong = &globals->songList[MamarBankSong];

        for (s32 i = 0; i < ARRAY_COUNT(bankSong->bkFileIndex); i++) {
            u16 bkFileIndex = bankSong->bkFileIndex[i];

            if (bkFileIndex != 0) {
                SBNFileEntry* bkFileEntry = &globals->sbnFileList[bkFileIndex];

                if ((bkFileEntry->data >> 0x18) == AU_FMT_BK) {
                    au_load_aux_bank((bkFileEntry->offset & 0xFFFFFF) + globals->baseRomOffset, i);
                }
            }
        }
    }

    player->seekPhrase = MamarStartSegment;
    player->seekTicks = MamarStartTick;
    player->songID = 0;
    player->bgmFile = bgmFile;
    player->bgmFileIndex = 0;
    *result = bgmFile->name;
    return true;
}

/// Where the host writes the BGM file to play, as it's stored in the ROM.
__attribute__((export_name("mamar_audio_bgm_buffer")))
u8* mamar_audio_bgm_buffer(void) {
    return MamarBGM;
}

/// Plays the `size`-byte BGM file in `MamarBGM` from segment `startSegment`, `startTick` ticks in. Its instruments are
/// loaded from the banks of `bankSong`, the ID of a song in the ROM, or none if it's -1. The song starts once the one
/// playing has stopped, which takes the engine a frame.
__attribute__((export_name("mamar_audio_play")))
void mamar_audio_play(s32 size, s32 variation, s32 bankSong, s32 startSegment, s32 startTick) {
    mamar_audio_stop();
    MamarBGMSize = CLAMP(size, 0, MAMAR_BGM_MAX_SIZE);
    MamarVariation = variation;
    MamarBankSong = bankSong;
    MamarStartSegment = startSegment;
    MamarStartTick = startTick;
    IsPlayRequested = true;
}

__attribute__((export_name("mamar_audio_stop")))
void mamar_audio_stop(void) {
    if (PlayingSongName != 0) {
        snd_song_stop(PlayingSongName);
        PlayingSongName = 0;
    }
    IsPlayRequested = false;
}

void mamar_update_song(void) {
    AuResult name;

    // A song stops on the engine's next update after it's asked to, and can't be replaced until then
    if (!IsPlayRequested || au_bgm_player_is_active(gBGMPlayerA)) {
        return;
    }
    IsPlayRequested = false;

    name = snd_song_load(0, 0);
    // Songs are named with four ASCII characters, and errors are small numbers
    if (name > 0xFFFF && snd_song_request_play(name, MamarVariation) == AU_RESULT_OK) {
        PlayingSongName = name;
        au_bgm_set_proximity_mix(PlayingSongName, ProximityMix);
        snd_song_set_linked_mode(PlayingSongName, AlternateParts);
    }
}

/// Sets the proximity mix, which chooses branch options and track volumes. See `au_bgm_set_proximity_mix`.
__attribute__((export_name("mamar_audio_set_proximity_mix")))
void mamar_audio_set_proximity_mix(u32 mix) {
    ProximityMix = mix;
    au_bgm_set_proximity_mix(PlayingSongName, mix);
}

/// Sets whether tracks play their alternate parts.
__attribute__((export_name("mamar_audio_set_alternate_parts")))
void mamar_audio_set_alternate_parts(b32 enabled) {
    AlternateParts = enabled;
    snd_song_set_linked_mode(PlayingSongName, enabled);
}

__attribute__((export_name("mamar_audio_segment")))
s32 mamar_audio_segment(void) {
    if (PlayingSongName == 0 || gBGMPlayerA->phrasePos == nullptr) {
        return -1;
    }
    return gBGMPlayerA->phrasePos - gBGMPlayerA->compStartPos;
}

__attribute__((export_name("mamar_audio_tick")))
s32 mamar_audio_tick(void) {
    return gBGMPlayerA->phraseTicks;
}

/// Beats per minute, times 100.
__attribute__((export_name("mamar_audio_tempo")))
s32 mamar_audio_tempo(void) {
    return gBGMPlayerA->masterTempo * 100 / BGM_TEMPO_SCALE;
}

extern u8 EnvelopeReleaseDefaultFast[];

static b32 IsTrackMuted[16];

b32 dx_mamar_is_track_muted(BGMPlayer* player, s32 trackIndex) {
    return player == gBGMPlayerA && IsTrackMuted[trackIndex];
}

/// Mutes each track whose bit is set in `muteMask`. If any bit of `soloMask` is set, mutes every track whose bit
/// isn't set there instead.
__attribute__((export_name("mamar_audio_set_track_mutes")))
void mamar_audio_set_track_mutes(u32 muteMask, u32 soloMask) {
    for (s32 i = 0; i < ARRAY_COUNT(IsTrackMuted); i++) {
        b32 isMuted = soloMask != 0 ? !(soloMask & (1 << i)) : (muteMask & (1 << i)) != 0;

        if (isMuted && !IsTrackMuted[i]) {
            BGMPlayerTrack* track = &gBGMPlayerA->tracks[i];

            // Release the notes the track is playing, as swapping to an alternate part does
            for (s32 voiceIdx = track->firstVoice; voiceIdx < track->lastVoice; voiceIdx++) {
                AuVoice* voice = &gBGMPlayerA->globals->voices[voiceIdx];

                if (voice->priority == gBGMPlayerA->priority) {
                    voice->envelope.cmdListRelease = EnvelopeReleaseDefaultFast;
                    voice->envelopeFlags |= AU_VOICE_ENV_FLAG_KEY_RELEASED;
                }
            }
        }
        IsTrackMuted[i] = isMuted;
    }
}
