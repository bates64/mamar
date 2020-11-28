#!/usr/bin/python3

from sys import argv
from os import path

dirname = path.dirname(__file__)

songs = [
    (0xF007C0, "Battle_Fanfare_02.bin"),
    (0xF02160, "Hey_You_03.bin"),
    (0xF03740, "The_Goomba_King_s_Decree_07.bin"),
    (0xF043F0, "Attack_of_the_Koopa_Bros_08.bin"),
    (0xF073C0, "Trojan_Bowser_09.bin"),
    (0xF08D40, "Chomp_Attack_0A.bin"),
    (0xF09600, "Ghost_Gulping_0B.bin"),
    (0xF0A550, "Keeping_Pace_0C.bin"),
    (0xF0BAE0, "Go_Mario_Go_0D.bin"),
    (0xF0DEC0, "Huffin_and_Puffin_0E.bin"),
    (0xF0FD20, "Freeze_0F.bin"),
    (0xF110D0, "Winning_a_Battle_8B.bin"),
    (0xF116C0, "Winning_a_Battle_and_Level_Up_8E.bin"),
    (0xF12320, "Jr_Troopa_Battle_04.bin"),
    (0xF13C20, "Final_Bowser_Battle_interlude_05.bin"),
    (0xF15F40, "Master_Battle_2C.bin"),
    (0xF16F80, "Game_Over_87.bin"),
    (0xF171D0, "Resting_at_the_Toad_House_88.bin"),
    (0xF17370, "Running_around_the_Heart_Pillar_in_Ch1_84.bin"),
    (0xF17570, "Tutankoopa_s_Warning_45.bin"),
    (0xF18940, "Kammy_Koopa_s_Theme_46.bin"),
    (0xF193D0, "Jr_Troopa_s_Theme_47.bin"),
    (0xF19BC0, "Goomba_King_s_Theme_50.bin"),
    (0xF1A6F0, "Koopa_Bros_Defeated_51.bin"),
    (0xF1ABD0, "Koopa_Bros_Theme_52.bin"),
    (0xF1C810, "Tutankoopa_s_Warning_2_53.bin"),
    (0xF1DBF0, "Tutankoopa_s_Theme_54.bin"),
    (0xF1F2E0, "Tubba_Blubba_s_Theme_55.bin"),
    (0xF20FF0, "General_Guy_s_Theme_56.bin"),
    (0xF21780, "Lava_Piranha_s_Theme_57.bin"),
    (0xF22A00, "Huff_N_Puff_s_Theme_58.bin"),
    (0xF23A00, "Crystal_King_s_Theme_59.bin"),
    (0xF24810, "Blooper_s_Theme_5A.bin"),
    (0xF25240, "Midboss_Theme_5B.bin"),
    (0xF26260, "Monstar_s_Theme_5C.bin"),
    (0xF27840, "Moustafa_s_Theme_86.bin"),
    (0xF27E20, "Fuzzy_Searching_Minigame_85.bin"),
    (0xF28E20, "Phonograph_in_Mansion_44.bin"),
    (0xF29AC0, "Toad_Town_00.bin"),
    (0xF2E130, "Bill_Blaster_Theme_48.bin"),
    (0xF2EF90, "Monty_Mole_Theme_in_Flower_Fields_49.bin"),
    (0xF30590, "Shy_Guys_in_Toad_Town_4A.bin"),
    (0xF318B0, "Whale_s_Problem_4C.bin"),
    (0xF32220, "Toad_Town_Sewers_4B.bin"),
    (0xF33060, "Unused_Theme_4D.bin"),
    (0xF33AA0, "Mario_s_House_Prologue_3E.bin"),
    (0xF33F10, "Peach_s_Party_3F.bin"),
    (0xF354E0, "Goomba_Village_01.bin"),
    (0xF35ED0, "Pleasant_Path_11.bin"),
    (0xF36690, "Fuzzy_s_Took_My_Shell_12.bin"),
    (0xF379E0, "Koopa_Village_13.bin"),
    (0xF38570, "Koopa_Bros_Fortress_14.bin"),
    (0xF39160, "Dry_Dry_Ruins_18.bin"),
    (0xF3A0D0, "Dry_Dry_Ruins_Mystery_19.bin"),
    (0xF3A450, "Mt_Rugged_16.bin"),
    (0xF3AF20, "Dry_Dry_Desert_Oasis_17.bin"),
    (0xF3C130, "Dry_Dry_Outpost_15.bin"),
    (0xF3CCC0, "Forever_Forest_1A.bin"),
    (0xF3E130, "Boo_s_Mansion_1B.bin"),
    (0xF3F3E0, "Bow_s_Theme_1C.bin"),
    (0xF40F00, "Gusty_Gulch_Adventure_1D.bin"),
    (0xF42F30, "Tubba_Blubba_s_Castle_1E.bin"),
    (0xF45500, "The_Castle_Crumbles_1F.bin"),
    (0xF465E0, "Shy_Guy_s_Toy_Box_20.bin"),
    (0xF474A0, "Toy_Train_Travel_21.bin"),
    (0xF47E10, "Big_Lantern_Ghost_s_Theme_22.bin"),
    (0xF48410, "Jade_Jungle_24.bin"),
    (0xF4A880, "Deep_Jungle_25.bin"),
    (0xF4BC00, "Lavalava_Island_26.bin"),
    (0xF4E690, "Search_for_the_Fearsome_5_27.bin"),
    (0xF50A00, "Raphael_the_Raven_28.bin"),
    (0xF52520, "Hot_Times_in_Mt_Lavalava_29.bin"),
    (0xF55C80, "Escape_from_Mt_Lavalava_2A.bin"),
    (0xF58ED0, "Cloudy_Climb_32.bin"),
    (0xF592B0, "Puff_Puff_Machine_33.bin"),
    (0xF5AFF0, "Flower_Fields_30.bin"),
    (0xF5C8D0, "Flower_Fields_Sunny_31.bin"),
    (0xF5DF40, "Sun_s_Tower_34.bin"),
    (0xF5F500, "Sun_s_Celebration_35.bin"),
    (0xF61700, "Shiver_City_38.bin"),
    (0xF62E50, "Detective_Mario_39.bin"),
    (0xF64220, "Snow_Road_3A.bin"),
    (0xF64CB0, "Over_Shiver_Mountain_3B.bin"),
    (0xF65B30, "Starborn_Valley_3C.bin"),
    (0xF66690, "Sanctuary_3D.bin"),
    (0xF66B70, "Crystal_Palace_37.bin"),
    (0xF67F80, "Star_Haven_60.bin"),
    (0xF69640, "Shooting_Star_Summit_61.bin"),
    (0xF6A050, "Legendary_Star_Ship_62.bin"),
    (0xF6C270, "Star_Sanctuary_63.bin"),
    (0xF6CED0, "Bowser_s_Castle___Caves_65.bin"),
    (0xF6EE40, "Bowser_s_Castle_64.bin"),
    (0xF73390, "Star_Elevator_2B.bin"),
    (0xF751F0, "Goomba_Bros_Defeated_7E.bin"),
    (0xF759C0, "Farewell_Twink_70.bin"),
    (0xF77200, "Peach_Cooking_71.bin"),
    (0xF77680, "Gourmet_Guy_72.bin"),
    (0xF78600, "Hope_on_the_Balcony_Peach_1_73.bin"),
    (0xF79070, "Peach_s_Theme_2_74.bin"),
    (0xF7A0C0, "Peach_Sneaking_75.bin"),
    (0xF7AA40, "Peach_Captured_76.bin"),
    (0xF7AD90, "Quiz_Show_Intro_77.bin"),
    (0xF7BEA0, "Unconscious_Mario_78.bin"),
    (0xF7C780, "Petunia_s_Theme_89.bin"),
    (0xF7DC00, "Flower_Fields_Door_appears_8A.bin"),
    (0xF7E190, "Beanstalk_7B.bin"),
    (0xF7EE20, "Lakilester_s_Theme_7D.bin"),
    (0xF80230, "The_Sun_s_Back_7F.bin"),
    (0xF81260, "Shiver_City_in_Crisis_79.bin"),
    (0xF82460, "Solved_Shiver_City_Mystery_7A.bin"),
    (0xF82D00, "Merlon_s_Spell_7C.bin"),
    (0xF83DC0, "Bowser_s_Theme_66.bin"),
    (0xF85590, "Train_Travel_80.bin"),
    (0xF860E0, "Whale_Trip_81.bin"),
    (0xF87000, "Chanterelle_s_Song_8C.bin"),
    (0xF87610, "Boo_s_Game_8D.bin"),
    (0xF88B30, "Dry_Dry_Ruins_rises_up_83.bin"),
    (0xF89570, "End_of_Chapter_40.bin"),
    (0xF8AAF0, "Beginning_of_Chapter_41.bin"),
    (0xF8B820, "Hammer_and_Jump_Upgrade_42.bin"),
    (0xF8BD90, "Found_Baby_Yoshi_s_4E.bin"),
    (0xF8C360, "New_Partner_JAP_96.bin"),
    (0xF8D110, "Unused_YI_Fanfare_4F.bin"),
    (0xF8D3E0, "Unused_YI_Fanfare_2_5D.bin"),
    (0xF90880, "Peach_s_Castle_inside_Bubble_5E.bin"),
    (0xF92A50, "Angry_Bowser_67.bin"),
    (0xF95510, "Bowser_s_Castle_explodes_5F.bin"),
    (0xF96280, "Peach_s_Wish_68.bin"),
    (0xF98520, "File_Select_69.bin"),
    (0xF98F90, "Title_Screen_6A.bin"),
    (0xF9B830, "Peach_s_Castle_in_Crisis_6B.bin"),
    (0xF9D3B0, "Mario_falls_from_Bowser_s_Castle_6C.bin"),
    (0xF9D690, "Peach_s_Arrival_6D.bin"),
    (0xF9EF30, "Star_Rod_Recovered_6F.bin"),
    (0xF9FA30, "Mario_s_House_94.bin"),
    (0xFA08A0, "Bowser_s_Attacks_95.bin"),
    (0xFA3C60, "End_Parade_1_90.bin"),
    (0xFA85F0, "End_Parade_2_91.bin"),
    (0xFABE90, "The_End_6E.bin"),
    (0xFACC80, "Koopa_Radio_Station_2D.bin"),
    (0xFAD210, "The_End_Low_Frequency__2E.bin"),
    (0xFAD8F0, "SMW_Remix_2F.bin"),
    (0xFADE70, "New_Partner_82.bin"),
    (0xFAE860, None),
]

if __name__ == "__main__":
    if len(argv) != 2:
        print("usage: ./extract.py [rom]")
        exit(1)

    with open(argv[1], "rb") as rom:
        # BGM
        for i, row in enumerate(songs):
            start, filename = row

            if not filename:
                continue

            end = songs[i + 1][0]

            length = end - start
            assert length >= 0

            with open(path.join(dirname, filename), "wb") as file:
                rom.seek(start)
                file.write(rom.read(length))

            print(filename)

        # SBN
        with open(path.join(dirname, "sbn.bin"), "wb") as file:
            rom.seek(0xF00000)
            file.write(rom.read(0x1942C40))
            print("sbn.bin")
