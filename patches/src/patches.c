#include "common.h"

void mamarNop(void) {
}

// state_step_logos
void skipIntroLogos(void) {
    /*clear_player_data();
    set_game_mode(7);
    gOverrideFlags = 0;
    gCurrentSaveFile.areaID = 1; // area_mac
    gCurrentSaveFile.mapID = 0; // machi
    gCurrentSaveFile.entryID = 0;*/
    if (intro_logos_fade_out(10)) {
        set_curtain_scale(1.0f);
        set_curtain_fade(0.0f);
        set_game_mode(GAME_MODE_TITLE_SCREEN);
    }
}
