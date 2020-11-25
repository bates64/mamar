///! These tests and benchmarks run on data extracted from a vanilla Paper Mario (U) ROM.
///! Run the following script to extract them:
///!
///!     $ ./bin/extract.py path/to/papermario.z64
///!
///! Each test checks for the following property:
///!
///!     encode(decode(bin)) == bin
///!
///! That is, decoding and re-encoding a song with no changes must equal the original input. We call this
///! **matching**, and it's required for the [decompilation project](https://github.com/ethteck/papermario).
///! It is also helpful as a generic test suite for any inconsistencies between the `de` and `en` modules.

use std::{path::Path, fs::File, io::prelude::*, io::Cursor};
use codec::Bgm;
use simple_logger::SimpleLogger;

/// Tests that the given song can be decoded then re-encoded to give the original input.
macro_rules! test_song {
    ($song:ident) => {
        #[allow(non_snake_case)]
        #[test]
        fn $song() {
            let _ = SimpleLogger::new().init();

            let bin_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("bin");

            // Decode the song
            log::info!("decoding...");
            let original = include_bytes!(concat!("bin/", stringify!($song), ".bin"));
            let bgm = Bgm::decode(&mut Cursor::new(original)).expect("decode error");

            // Encode the Bgm
            log::info!("encoding...");
            let mut encoded = Cursor::new(Vec::new());
            bgm.encode(&mut encoded).unwrap();
            let encoded = encoded.into_inner();

            // Check the output matches
            if encoded != original {
                log::error!("non-matching!! D:");

                // Output `encoded` to a file for debugging...
                let nonmatching_bin = concat!(stringify!($song), ".nonmatching.bin");
                let mut out = File::create(bin_dir.join(nonmatching_bin)).expect("write nonmatching.bin");
                out.write_all(&encoded).unwrap();

                // ...and fail the test.
                panic!("Re-encoded song did not match original. Wrote non-matching output to tests/bin/{}", nonmatching_bin);
            }
        }
    };
}

test_song!(Battle_Fanfare_02);
test_song!(Hey_You_03);
test_song!(The_Goomba_King_s_Decree_07);
test_song!(Attack_of_the_Koopa_Bros_08);
test_song!(Trojan_Bowser_09);
test_song!(Chomp_Attack_0A);
test_song!(Ghost_Gulping_0B);
test_song!(Keeping_Pace_0C);
test_song!(Go_Mario_Go_0D);
test_song!(Huffin_and_Puffin_0E);
test_song!(Freeze_0F);
test_song!(Winning_a_Battle_8B);
test_song!(Winning_a_Battle_and_Level_Up_8E);
test_song!(Jr_Troopa_Battle_04);
test_song!(Final_Bowser_Battle_interlude_05);
test_song!(Master_Battle_2C);
test_song!(Game_Over_87);
test_song!(Resting_at_the_Toad_House_88);
test_song!(Running_around_the_Heart_Pillar_in_Ch1_84);
test_song!(Tutankoopa_s_Warning_45);
test_song!(Kammy_Koopa_s_Theme_46);
test_song!(Jr_Troopa_s_Theme_47);
test_song!(Goomba_King_s_Theme_50);
test_song!(Koopa_Bros_Defeated_51);
test_song!(Koopa_Bros_Theme_52);
test_song!(Tutankoopa_s_Warning_2_53);
test_song!(Tutankoopa_s_Theme_54);
test_song!(Tubba_Blubba_s_Theme_55);
test_song!(General_Guy_s_Theme_56);
test_song!(Lava_Piranha_s_Theme_57);
test_song!(Huff_N_Puff_s_Theme_58);
test_song!(Crystal_King_s_Theme_59);
test_song!(Blooper_s_Theme_5A);
test_song!(Midboss_Theme_5B);
test_song!(Monstar_s_Theme_5C);
test_song!(Moustafa_s_Theme_86);
test_song!(Fuzzy_Searching_Minigame_85);
test_song!(Phonograph_in_Mansion_44);
test_song!(Toad_Town_00);
test_song!(Bill_Blaster_Theme_48);
test_song!(Monty_Mole_Theme_in_Flower_Fields_49);
test_song!(Shy_Guys_in_Toad_Town_4A);
test_song!(Whale_s_Problem_4C);
test_song!(Toad_Town_Sewers_4B);
test_song!(Unused_Theme_4D);
test_song!(Mario_s_House_Prologue_3E);
test_song!(Peach_s_Party_3F);
test_song!(Goomba_Village_01);
test_song!(Pleasant_Path_11);
test_song!(Fuzzy_s_Took_My_Shell_12);
test_song!(Koopa_Village_13);
test_song!(Koopa_Bros_Fortress_14);
test_song!(Dry_Dry_Ruins_18);
test_song!(Dry_Dry_Ruins_Mystery_19);
test_song!(Mt_Rugged_16);
test_song!(Dry_Dry_Desert_Oasis_17);
test_song!(Dry_Dry_Outpost_15);
test_song!(Forever_Forest_1A);
test_song!(Boo_s_Mansion_1B);
test_song!(Bow_s_Theme_1C);
test_song!(Gusty_Gulch_Adventure_1D);
test_song!(Tubba_Blubba_s_Castle_1E);
test_song!(The_Castle_Crumbles_1F);
test_song!(Shy_Guy_s_Toy_Box_20);
test_song!(Toy_Train_Travel_21);
test_song!(Big_Lantern_Ghost_s_Theme_22);
test_song!(Jade_Jungle_24);
test_song!(Deep_Jungle_25);
test_song!(Lavalava_Island_26);
test_song!(Search_for_the_Fearsome_5_27);
test_song!(Raphael_the_Raven_28);
test_song!(Hot_Times_in_Mt_Lavalava_29);
test_song!(Escape_from_Mt_Lavalava_2A);
test_song!(Cloudy_Climb_32);
test_song!(Puff_Puff_Machine_33);
test_song!(Flower_Fields_30);
test_song!(Flower_Fields_Sunny_31);
test_song!(Sun_s_Tower_34);
test_song!(Sun_s_Celebration_35);
test_song!(Shiver_City_38);
test_song!(Detective_Mario_39);
test_song!(Snow_Road_3A);
test_song!(Over_Shiver_Mountain_3B);
test_song!(Starborn_Valley_3C);
test_song!(Sanctuary_3D);
test_song!(Crystal_Palace_37);
test_song!(Star_Haven_60);
test_song!(Shooting_Star_Summit_61);
test_song!(Legendary_Star_Ship_62);
test_song!(Star_Sanctuary_63);
test_song!(Bowser_s_Castle___Caves_65);
test_song!(Bowser_s_Castle_64);
test_song!(Star_Elevator_2B);
test_song!(Goomba_Bros_Defeated_7E);
test_song!(Farewell_Twink_70);
test_song!(Peach_Cooking_71);
test_song!(Gourmet_Guy_72);
test_song!(Hope_on_the_Balcony_Peach_1_73);
test_song!(Peach_s_Theme_2_74);
test_song!(Peach_Sneaking_75);
test_song!(Peach_Captured_76);
test_song!(Quiz_Show_Intro_77);
test_song!(Unconscious_Mario_78);
test_song!(Petunia_s_Theme_89);
test_song!(Flower_Fields_Door_appears_8A);
test_song!(Beanstalk_7B);
test_song!(Lakilester_s_Theme_7D);
test_song!(The_Sun_s_Back_7F);
test_song!(Shiver_City_in_Crisis_79);
test_song!(Solved_Shiver_City_Mystery_7A);
test_song!(Merlon_s_Spell_7C);
test_song!(Bowser_s_Theme_66);
test_song!(Train_Travel_80);
test_song!(Whale_Trip_81);
test_song!(Chanterelle_s_Song_8C);
test_song!(Boo_s_Game_8D);
test_song!(Dry_Dry_Ruins_rises_up_83);
test_song!(End_of_Chapter_40);
test_song!(Beginning_of_Chapter_41);
test_song!(Hammer_and_Jump_Upgrade_42);
test_song!(Found_Baby_Yoshi_s_4E);
test_song!(New_Partner_JAP_96);
test_song!(Unused_YI_Fanfare_4F);
test_song!(Unused_YI_Fanfare_2_5D);
test_song!(Peach_s_Castle_inside_Bubble_5E);
test_song!(Angry_Bowser_67);
test_song!(Bowser_s_Castle_explodes_5F);
test_song!(Peach_s_Wish_68);
test_song!(File_Select_69);
test_song!(Title_Screen_6A);
test_song!(Peach_s_Castle_in_Crisis_6B);
test_song!(Mario_falls_from_Bowser_s_Castle_6C);
test_song!(Peach_s_Arrival_6D);
test_song!(Star_Rod_Recovered_6F);
test_song!(Mario_s_House_94);
test_song!(Bowser_s_Attacks_95);
test_song!(End_Parade_1_90);
test_song!(End_Parade_2_91);
test_song!(The_End_6E);
test_song!(Koopa_Radio_Station_2D);
test_song!(The_End_Low_Frequency__2E);
test_song!(SMW_Remix_2F);
test_song!(New_Partner_82);
