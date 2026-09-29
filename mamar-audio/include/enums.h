// Stands in for papermario-dx's include/enums.h, with only what its audio engine uses.
#ifndef _ENUMS_H_
#define _ENUMS_H_
enum SoundIDBits {
    SOUND_ID_STOP                   = 0x00008000,
    SOUND_ID_LOWER                  = 0x000023FF,
    SOUND_ID_UNK                    = 0x00002000, // sounds belonging to special large section
    SOUND_ID_ADJUST                 = 0x00001000,
    SOUND_ID_TRIGGER_MASK           = 0x00000C00,
    SOUND_ID_TRIGGER_CHANGE_VOLUME  = 0x00000800,
    SOUND_ID_TRIGGER_CHANGE_SOUND   = 0x00000400,
    SOUND_ID_SECTION_MASK           = 0x00000300, // corresponds to sections 0-3 for indices < 0xC0 and 4-7 for those above
    SOUND_ID_INDEX_MASK             = 0x000000FF,
    SOUND_ID_UNK_INDEX_MASK         = 0x000001FF, // indices for the special large section

    SOUND_ID_UPPER_MASK             = 0x03FF0000,
    SOUND_ID_TYPE_MASK              = 0x70000000,
    SOUND_ID_TYPE_FLAG              = 0x80000000,
};

enum SoundIDs {
    SOUND_NONE = 0x00000000,
    SOUND_LRAW_CHEERING = 0x00000349,
    SOUND_SHORT_CLAP = 0x0000034A,
};

typedef enum AuResult {
    AU_RESULT_OK                        = 0,
    AU_ERROR_1                          = 1,
    AU_AMBIENCE_STOP_ERROR_1            = 1,
    AU_AMBIENCE_STOP_ERROR_2            = 2,
    AU_AMBIENCE_ERROR_PLAYER_BUSY       = 1, // player already has an mseq playing
    AU_ERROR_SONG_NOT_PLAYING           = 2, // player not found for songName
    AU_AMBIENCE_ERROR_MSEQ_NOT_FOUND    = 2, // mseq not found
    AU_ERROR_NULL_SONG_NAME             = 3, // songName is nullptr
    AU_AMBIENCE_ERROR_3                 = 3,
    AU_ERROR_INVALID_SONG_DURATION      = 4, // duration out of bounds: (250,10000)
    AU_ERROR_6                          = 6,
    AU_ERROR_7                          = 7,
    AU_ERROR_11                         = 11,
    AU_ERROR_SBN_INDEX_OUT_OF_RANGE     = 101,
    AU_ERROR_SBN_FORMAT_MISMATCH        = 102,
    AU_ERROR_151                        = 151,
    AU_ERROR_201                        = 201
} AuResult;

typedef enum AuFileFormat {
    AU_FMT_BGM              = 0x10,
    AU_FMT_SEF              = 0x20,
    AU_FMT_BK               = 0x30,
    AU_FMT_PER              = 0x40,
    AU_FMT_PRG              = 0x40,
    AU_FMT_MSEQ             = 0x40
} AuFileFormat;

enum {
    MUSIC_PROXIMITY_FAR,
    MUSIC_PROXIMITY_NEAR,
    MUSIC_PROXIMITY_FULL
};

typedef enum MusicTrackVols {
    TRACK_VOLS_JAN_FULL     = 0,
    TRACK_VOLS_UNUSED_1     = 1,
    TRACK_VOLS_TIK_SHIVER   = 2,
    TRACK_VOLS_UNUSED_3     = 3,
    TRACK_VOLS_KPA_OUTSIDE  = 4,
    TRACK_VOLS_KPA_1        = 5,
    TRACK_VOLS_KPA_2        = 6,
    TRACK_VOLS_KPA_3        = 7
} MusicTrackVols;

typedef enum BGMVariation {
    BGM_VARIATION_0                 = 0,
    BGM_VARIATION_1                 = 1,
    BGM_VARIATION_2                 = 2,
    BGM_VARIATION_3                 = 3,
} BGMVariation;

/// Perceptual volume levels, 0 (mute) to 8 (max).
/// Only attenuates, never amplifies.
typedef enum VolumeLevels {
    VOL_LEVEL_MUTE      = 0,
    VOL_LEVEL_1         = 1,
    VOL_LEVEL_2         = 2,
    VOL_LEVEL_3         = 3,
    VOL_LEVEL_4         = 4,
    VOL_LEVEL_5         = 5,
    VOL_LEVEL_6         = 6,
    VOL_LEVEL_7         = 7,
    VOL_LEVEL_FULL      = 8,
} VolumeLevels;
enum AmbientSounds {
    AMBIENT_SPOOKY          = 0,
    AMBIENT_WIND            = 1,
    AMBIENT_BEACH           = 2,
    AMBIENT_JUNGLE          = 3,
    AMBIENT_LAVA_1          = 4,
    AMBIENT_LAVA_2          = 5,
    AMBIENT_SILENCE         = 6,
    AMBIENT_LAVA_3          = 7,
    AMBIENT_LAVA_4          = 8,
    AMBIENT_LAVA_5          = 9,
    AMBIENT_LAVA_6          = 10,
    AMBIENT_LAVA_7          = 11,
    AMBIENT_BIRDS           = 12,
    AMBIENT_SEA             = 13,
    AMBIENT_RADIO           = 16, // radio songs for nok
    // the following 4 IDs are reserved for additional radio songs,
    // and no more are expected to follow after that
    // see: au_ambient_load
};
#endif
