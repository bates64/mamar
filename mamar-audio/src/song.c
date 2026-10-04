// Plays the song the host writes into `MamarBGM`, in place of a song from the ROM.
#include "glue.h"
#include "rsp-hle/hle_external.h"

// Each BGM player's file buffer is 0x5000 bytes
#define MAMAR_BGM_MAX_SIZE 0x5000

static u8 MamarBGM[MAMAR_BGM_MAX_SIZE];
static s32 MamarBGMSize;
/// The SBN file index of the BK file loaded into each aux bank slot, or 0 for none.
static u16 MamarAuxBanks[ARRAY_COUNT(((AuGlobals*)0)->auxBanks)];
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

    for (s32 i = 0; i < ARRAY_COUNT(MamarAuxBanks); i++) {
        u16 bkFileIndex = MamarAuxBanks[i];

        // A slot without a bank plays the default instrument, not one left by the last song
        if (bkFileIndex != 0 && bkFileIndex < globals->fileListLength
            && (globals->sbnFileList[bkFileIndex].data >> 0x18) == AU_FMT_BK) {
            au_load_aux_bank((globals->sbnFileList[bkFileIndex].offset & 0xFFFFFF) + globals->baseRomOffset, i);
        } else {
            au_clear_instrument_group(i, BANK_SET_AUX);
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

/// The most bytes the host can write into the buffer `mamar_audio_bgm_buffer` gives.
__attribute__((export_name("mamar_audio_bgm_max_size")))
s32 mamar_audio_bgm_max_size(void) {
    return MAMAR_BGM_MAX_SIZE;
}

/// How many aux banks a song can load its own instruments from.
__attribute__((export_name("mamar_audio_aux_bank_count")))
s32 mamar_audio_aux_bank_count(void) {
    return ARRAY_COUNT(MamarAuxBanks);
}

/// Loads aux bank `slot` from the BK file at index `fileIndex` of the SBN's file list, or leaves it empty if it's 0,
/// when the next song plays.
__attribute__((export_name("mamar_audio_set_aux_bank")))
void mamar_audio_set_aux_bank(s32 slot, s32 fileIndex) {
    if (slot >= 0 && slot < ARRAY_COUNT(MamarAuxBanks)) {
        MamarAuxBanks[slot] = fileIndex;
    }
}

/// Plays the `size`-byte BGM file in `MamarBGM` from segment `startSegment`, `startTick` ticks in, with the aux banks
/// set by `mamar_audio_set_aux_bank`. The song starts once the one playing has stopped, which takes the engine a frame.
__attribute__((export_name("mamar_audio_play")))
void mamar_audio_play(s32 size, s32 variation, s32 startSegment, s32 startTick) {
    mamar_audio_stop();
    MamarBGMSize = CLAMP(size, 0, MAMAR_BGM_MAX_SIZE);
    MamarVariation = variation;
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

/// How many voices the engine has
#define NUM_VOICES ARRAY_COUNT(((AuGlobals*)0)->voices)

/// How many tracks a song has
#define NUM_TRACKS ARRAY_COUNT(gBGMPlayerA->tracks)

/**
 * What each track's voices add to the left and right outputs in the part of the frame being mixed, sample by sample.
 * The engine mixes a frame in parts, each voice once in each, so a track's voices sum here before it's metered.
 */
static s32 TrackMix[NUM_TRACKS][2][ENVMIX_METER_SAMPLES];
static s32 TrackMixLength;
/// Which voices are mixed in the part of the frame being mixed.
static b32 IsVoiceMixed[NUM_VOICES];
/// The loudest samples each track has played on the left and right since the host last read the levels.
static s32 TrackPeaks[NUM_TRACKS][2];

/// The track of the song that owns voice `voice`, or -1 if none does.
static s32 voice_track(s32 voice) {
    if (gSoundGlobals->voices[voice].priority != gBGMPlayerA->priority) {
        return -1;
    }
    // A linked track shares the voices of the track it's for, which comes first. A track the region doesn't play keeps
    // the voices it last had, which are another track's now.
    for (s32 i = 0; i < NUM_TRACKS; i++) {
        BGMPlayerTrack* track = &gBGMPlayerA->tracks[i];
        if (track->bgmReadPos != nullptr && voice >= track->firstVoice && voice < track->lastVoice) {
            return i;
        }
    }
    return -1;
}

/// Meters what the tracks played in the part of the frame just mixed, and starts the next part.
void mamar_finish_mix(void) {
    for (s32 i = 0; i < NUM_TRACKS; i++) {
        for (s32 channel = 0; channel < 2; channel++) {
            for (s32 k = 0; k < TrackMixLength; k++) {
                s32 sample = TrackMix[i][channel][k];
                TrackPeaks[i][channel] = MAX(TrackPeaks[i][channel], sample < 0 ? -sample : sample);
            }
        }
    }
    memset(TrackMix, 0, sizeof(TrackMix));
    memset(IsVoiceMixed, 0, sizeof(IsVoiceMixed));
    TrackMixLength = 0;
}

void HleEnvMixed(uint32_t address, const int32_t* left, const int32_t* right, int count) {
    s32 voice = -1;
    for (s32 i = 0; i < gSynDriverPtr->numPvoice && i < NUM_VOICES; i++) {
        if ((u32)gSynDriverPtr->pvoices[i].envMixer.state == address) {
            voice = i;
            break;
        }
    }
    if (voice < 0) {
        return;
    }

    // A voice mixed again is in the next part of the frame
    if (IsVoiceMixed[voice]) {
        mamar_finish_mix();
    }
    IsVoiceMixed[voice] = true;

    s32 track = voice_track(voice);
    if (track < 0) {
        return;
    }
    TrackMixLength = MAX(TrackMixLength, count);
    for (s32 k = 0; k < count; k++) {
        TrackMix[track][0][k] += left[k];
        TrackMix[track][1][k] += right[k];
    }
}

/// The loudest left and right samples each track of the song has played since this was last called, out of 0x8000.
__attribute__((export_name("mamar_audio_track_levels")))
u16* mamar_audio_track_levels(void) {
    static u16 levels[NUM_TRACKS][2];

    for (s32 i = 0; i < NUM_TRACKS; i++) {
        levels[i][0] = MIN(TrackPeaks[i][0], 0x8000);
        levels[i][1] = MIN(TrackPeaks[i][1], 0x8000);
    }
    memset(TrackPeaks, 0, sizeof(TrackPeaks));
    return &levels[0][0];
}
