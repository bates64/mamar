import { PatchAddress } from "pm64-typegen"

export enum MusicBankSet {
    BK_96_GM01,
    BK_97_GM02,
    BK_98_GM03,
    BK_99_GM04,
    BK_9A_GM05,
    BK_9B_GM06,
    BK_9C_GM07,
    BK_9D_GM08,
    BK_9E_GM09,
    BK_9F_GM10,
    BK_A0_GM11,
    BK_90_PS01,
    BK_91_PS02,
    BK_92_PS03,
    BK_93_PS04,
    BK_94_PS05,
}

const baseCategories = [
    {
        name: "Piano",
        instruments: [
            { bank: MusicBankSet.BK_98_GM03, instrument: 0x0, name: "E. Piano 1 C5" },
            { bank: MusicBankSet.BK_98_GM03, instrument: 0x1, name: "E. Piano 1 C6" },
            { bank: MusicBankSet.BK_98_GM03, instrument: 0x2, name: "E. Piano 1 C7" },

            { bank: MusicBankSet.BK_98_GM03, instrument: 0x3, name: "Honky-Tonk C5" },
            { bank: MusicBankSet.BK_98_GM03, instrument: 0x4, name: "Honky-Tonk C6" },

            { bank: MusicBankSet.BK_9C_GM07, instrument: 0x0, name: "Piano 3 C5" },
            { bank: MusicBankSet.BK_9C_GM07, instrument: 0x1, name: "Piano 3 C6" },
            { bank: MusicBankSet.BK_9C_GM07, instrument: 0x2, name: "Piano 3 C7" },

            { bank: MusicBankSet.BK_9D_GM08, instrument: 0x5, name: "St. FM EP C6" },
            { bank: MusicBankSet.BK_9D_GM08, instrument: 0x6, name: "St. FM EP C7" },

            { bank: MusicBankSet.BK_9D_GM08, instrument: 0x7, name: "St. Soft EP C6" },
            { bank: MusicBankSet.BK_9D_GM08, instrument: 0x8, name: "St. Soft EP C7" },

            { bank: MusicBankSet.BK_9F_GM10, instrument: 0x2, name: "Harpsichord C5" },
            { bank: MusicBankSet.BK_9F_GM10, instrument: 0x3, name: "Harpsichord C6" },
        ],
    },
    {
        name: "Chromatic Percussion",
        instruments: [
            { bank: MusicBankSet.BK_96_GM01, instrument: 0x0, name: "Marimba C5" },
            { bank: MusicBankSet.BK_96_GM01, instrument: 0x1, name: "Marimba C6" },
            { bank: MusicBankSet.BK_96_GM01, instrument: 0x2, name: "Marimba C7" },

            { bank: MusicBankSet.BK_96_GM01, instrument: 0x3, name: "Xylophone C5" },
            { bank: MusicBankSet.BK_96_GM01, instrument: 0x4, name: "Xylophone C6" },
            { bank: MusicBankSet.BK_96_GM01, instrument: 0x5, name: "Xylophone C7" },

            { bank: MusicBankSet.BK_96_GM01, instrument: 0x6, name: "Vibraphone C5" },
            { bank: MusicBankSet.BK_96_GM01, instrument: 0x7, name: "Vibraphone C6" },
            { bank: MusicBankSet.BK_96_GM01, instrument: 0x8, name: "Vibraphone C7" },

            { bank: MusicBankSet.BK_96_GM01, instrument: 0x9, name: "Music Box C6" },
            { bank: MusicBankSet.BK_96_GM01, instrument: 0xA, name: "Music Box C7" },

            { bank: MusicBankSet.BK_96_GM01, instrument: 0xF, name: "Log Drum C6" },

            { bank: MusicBankSet.BK_9D_GM08, instrument: 0x2, name: "Tubular-Bell C7" },

            { bank: MusicBankSet.BK_9D_GM08, instrument: 0xB, name: "Celesta C6" },

            { bank: MusicBankSet.BK_9E_GM09, instrument: 0x0, name: "Glockenspiel C7" },
            { bank: MusicBankSet.BK_9E_GM09, instrument: 0x1, name: "Glockenspiel C8" },

            { bank: MusicBankSet.BK_9E_GM09, instrument: 0x2, name: "Santur C6" },
            { bank: MusicBankSet.BK_9E_GM09, instrument: 0x3, name: "Santur C7" },
        ],
    },
    {
        name: "Organ",
        instruments: [
            { bank: MusicBankSet.BK_9A_GM05, instrument: 0xD, name: "Organ 1 C6" },
            { bank: MusicBankSet.BK_9A_GM05, instrument: 0xE, name: "Organ 1 C7" },
            { bank: MusicBankSet.BK_9A_GM05, instrument: 0xF, name: "Organ 1 C8" },

            { bank: MusicBankSet.BK_9B_GM06, instrument: 0x4, name: "Organ 4 C7" },

            { bank: MusicBankSet.BK_9C_GM07, instrument: 0x3, name: "Rotary Org. F C6" },
            { bank: MusicBankSet.BK_9C_GM07, instrument: 0x4, name: "Rotary Org. F C7" },

            { bank: MusicBankSet.BK_9E_GM09, instrument: 0x9, name: "Bandoneon C5" },
            { bank: MusicBankSet.BK_9E_GM09, instrument: 0xA, name: "Bandoneon C6" },
            { bank: MusicBankSet.BK_9E_GM09, instrument: 0xB, name: "Bandoneon C7" },

            { bank: MusicBankSet.BK_A0_GM11, instrument: 0x3, name: "Church Org 2 C6" },
        ],
    },
    {
        name: "Guitar",
        instruments: [
            { bank: MusicBankSet.BK_98_GM03, instrument: 0x7, name: "Nylon-Str. Gt. C5" },
            { bank: MusicBankSet.BK_98_GM03, instrument: 0x8, name: "Nylon-Str. Gt. C6" },

            { bank: MusicBankSet.BK_98_GM03, instrument: 0x9, name: "Steel-Str. Gt. C4" },
            { bank: MusicBankSet.BK_98_GM03, instrument: 0xA, name: "Steel-Str. Gt. B4" },
            { bank: MusicBankSet.BK_98_GM03, instrument: 0xB, name: "Steel-Str. Gt. G5" },
            { bank: MusicBankSet.BK_98_GM03, instrument: 0xC, name: "Steel-Str. Gt. G6" },

            { bank: MusicBankSet.BK_9A_GM05, instrument: 0x4, name: "Distortion Gt. C6" },
            { bank: MusicBankSet.BK_9A_GM05, instrument: 0x5, name: "Distortion Gt. C7" },

            { bank: MusicBankSet.BK_9B_GM06, instrument: 0x2, name: "Overdrive Gt. C6" },
            { bank: MusicBankSet.BK_9B_GM06, instrument: 0x3, name: "Overdrive Gt. C7" },

            { bank: MusicBankSet.BK_A0_GM11, instrument: 0x2, name: "Muted Dis. Gt C5" },
        ],
    },
    {
        name: "Bass",
        instruments: [
            { bank: MusicBankSet.BK_9A_GM05, instrument: 0x0, name: "Acoustic Bs. C3" },
            { bank: MusicBankSet.BK_9A_GM05, instrument: 0x1, name: "Acoustic Bs. C4" },

            { bank: MusicBankSet.BK_9B_GM06, instrument: 0xC, name: "Fingered Bs. C3" },
            { bank: MusicBankSet.BK_9B_GM06, instrument: 0xD, name: "Fingered Bs. C4" },

            { bank: MusicBankSet.BK_9C_GM07, instrument: 0x5, name: "Syn. Bass 101 C4" },

            { bank: MusicBankSet.BK_9C_GM07, instrument: 0x8, name: "Synth Bass 1 C3" },
            { bank: MusicBankSet.BK_9C_GM07, instrument: 0x9, name: "Synth Bass 1 C4" },

            { bank: MusicBankSet.BK_9D_GM08, instrument: 0x1, name: "Slap Bass 2 C4" },

            { bank: MusicBankSet.BK_9F_GM10, instrument: 0x6, name: "Syn. Bass 201 C3" },
            { bank: MusicBankSet.BK_9F_GM10, instrument: 0x7, name: "Syn. Bass 201 C4" },
        ],
    },
    {
        name: "Orchestra",
        instruments: [
            { bank: MusicBankSet.BK_97_GM02, instrument: 0x0, name: "Violin C4" },
            { bank: MusicBankSet.BK_97_GM02, instrument: 0x1, name: "Violin C5" },
            { bank: MusicBankSet.BK_97_GM02, instrument: 0x2, name: "Violin C6" },
            { bank: MusicBankSet.BK_97_GM02, instrument: 0x3, name: "Violin C7" },

            { bank: MusicBankSet.BK_97_GM02, instrument: 0x4, name: "Pizzicato Str C4" },
            { bank: MusicBankSet.BK_97_GM02, instrument: 0x5, name: "Pizzicato Str C5" },
            { bank: MusicBankSet.BK_97_GM02, instrument: 0x6, name: "Pizzicato Str C6" },
            { bank: MusicBankSet.BK_97_GM02, instrument: 0x7, name: "Pizzicato Str C7" },

            { bank: MusicBankSet.BK_97_GM02, instrument: 0xC, name: "Timpani F3" },
            { bank: MusicBankSet.BK_97_GM02, instrument: 0xD, name: "Timpani F4" },
            { bank: MusicBankSet.BK_97_GM02, instrument: 0xE, name: "Timpani F3 (Soft)" },
            { bank: MusicBankSet.BK_97_GM02, instrument: 0xF, name: "Timpani F4 (Soft)" },

            { bank: MusicBankSet.BK_9F_GM10, instrument: 0x0, name: "Harp C6" },
            { bank: MusicBankSet.BK_9F_GM10, instrument: 0x1, name: "Harp C7" },
        ],
    },
    {
        name: "Ensemble",
        instruments: [
            { bank: MusicBankSet.BK_97_GM02, instrument: 0x8, name: "Strings 2 C5" },
            { bank: MusicBankSet.BK_97_GM02, instrument: 0x9, name: "Strings 2 C6" },
            { bank: MusicBankSet.BK_97_GM02, instrument: 0xA, name: "Strings 2 C7" },
            { bank: MusicBankSet.BK_97_GM02, instrument: 0xB, name: "Strings 2 C8" },

            { bank: MusicBankSet.BK_9E_GM09, instrument: 0x8, name: "Orchestra Hit C6" },
        ],
    },
    {
        name: "Brass",
        instruments: [
            { bank: MusicBankSet.BK_99_GM04, instrument: 0x0, name: "Trumpet C7" },

            { bank: MusicBankSet.BK_99_GM04, instrument: 0x1, name: "Trombone C4" },
            { bank: MusicBankSet.BK_99_GM04, instrument: 0x2, name: "Trombone C5" },
            { bank: MusicBankSet.BK_99_GM04, instrument: 0x3, name: "Trombone C6" },

            { bank: MusicBankSet.BK_99_GM04, instrument: 0x4, name: "Tuba C6" },

            { bank: MusicBankSet.BK_9A_GM05, instrument: 0x2, name: "Brass 1 C6" },
            { bank: MusicBankSet.BK_9A_GM05, instrument: 0x3, name: "Brass 1 C7" },

            { bank: MusicBankSet.BK_9B_GM06, instrument: 0x0, name: "Muted Trumpet C6" },
            { bank: MusicBankSet.BK_9B_GM06, instrument: 0x1, name: "Muted Trumpet C7" },

            { bank: MusicBankSet.BK_9C_GM07, instrument: 0xA, name: "Synth Brass 1 C5" },
            { bank: MusicBankSet.BK_9C_GM07, instrument: 0xB, name: "Synth Brass 1 C6" },

            { bank: MusicBankSet.BK_9F_GM10, instrument: 0x4, name: "Baritone Sax C5" },
            { bank: MusicBankSet.BK_9F_GM10, instrument: 0x5, name: "Baritone Sax C6" },
        ],
    },
    {
        name: "Reed",
        instruments: [
            { bank: MusicBankSet.BK_98_GM03, instrument: 0xD, name: "English Horn C5" },
            { bank: MusicBankSet.BK_98_GM03, instrument: 0xE, name: "English Horn C6" },

            { bank: MusicBankSet.BK_99_GM04, instrument: 0x5, name: "Bassoon C3" },
            { bank: MusicBankSet.BK_99_GM04, instrument: 0x6, name: "Bassoon C4" },
            { bank: MusicBankSet.BK_99_GM04, instrument: 0x7, name: "Bassoon C5" },

            { bank: MusicBankSet.BK_99_GM04, instrument: 0x8, name: "Clarinet C6" },
            { bank: MusicBankSet.BK_99_GM04, instrument: 0x9, name: "Clarinet C7" },

            { bank: MusicBankSet.BK_99_GM04, instrument: 0xA, name: "Oboe C5" },
            { bank: MusicBankSet.BK_99_GM04, instrument: 0xB, name: "Oboe C6" },
        ],
    },
    {
        name: "Pipe",
        instruments: [
            { bank: MusicBankSet.BK_99_GM04, instrument: 0xD, name: "Piccolo C8" },

            { bank: MusicBankSet.BK_9A_GM05, instrument: 0x7, name: "Flute C6" },
            { bank: MusicBankSet.BK_9A_GM05, instrument: 0x8, name: "Flute C7" },
            { bank: MusicBankSet.BK_9A_GM05, instrument: 0x9, name: "Flute C8" },

            { bank: MusicBankSet.BK_9B_GM06, instrument: 0xE, name: "Ocarina C6" },
            { bank: MusicBankSet.BK_9B_GM06, instrument: 0xF, name: "Ocarina C8" },

            { bank: MusicBankSet.BK_9C_GM07, instrument: 0xC, name: "Whistle C7" },
            { bank: MusicBankSet.BK_9C_GM07, instrument: 0xD, name: "Whistle C8" },

            { bank: MusicBankSet.BK_9C_GM07, instrument: 0xE, name: "Pan Flute C7" },
            { bank: MusicBankSet.BK_9C_GM07, instrument: 0xF, name: "Pan Flute C8" },
        ],
    },
    {
        name: "Synth",
        instruments: [
            { bank: MusicBankSet.BK_96_GM01, instrument: 0xB, name: "Aqua C4" },
            { bank: MusicBankSet.BK_96_GM01, instrument: 0xC, name: "Aqua C5" },
            { bank: MusicBankSet.BK_96_GM01, instrument: 0xD, name: "Aqua C6" },

            { bank: MusicBankSet.BK_98_GM03, instrument: 0x5, name: "Crystal C7" },
            { bank: MusicBankSet.BK_98_GM03, instrument: 0x6, name: "Crystal C9" },

            { bank: MusicBankSet.BK_99_GM04, instrument: 0xE, name: "Doctor Solo C4" },
            { bank: MusicBankSet.BK_99_GM04, instrument: 0xF, name: "Doctor Solo C6" },

            { bank: MusicBankSet.BK_9B_GM06, instrument: 0x9, name: "Space Voice C5" },
            { bank: MusicBankSet.BK_9B_GM06, instrument: 0xA, name: "Space Voice C6" },
            { bank: MusicBankSet.BK_9B_GM06, instrument: 0xB, name: "Space Voice C7" },

            { bank: MusicBankSet.BK_9D_GM08, instrument: 0x0, name: "7th Atmos. C7" },

            { bank: MusicBankSet.BK_9D_GM08, instrument: 0x3, name: "Saw Wave C6" },
            { bank: MusicBankSet.BK_9D_GM08, instrument: 0x4, name: "Saw Wave C7" },

            { bank: MusicBankSet.BK_9D_GM08, instrument: 0x9, name: "Vibra Bells C6" },
            { bank: MusicBankSet.BK_9D_GM08, instrument: 0xA, name: "Vibra Bells C8" },

            { bank: MusicBankSet.BK_9D_GM08, instrument: 0xD, name: "Bowed Glass C7" },

            { bank: MusicBankSet.BK_9D_GM08, instrument: 0xE, name: "Vox Lead C6" },
            { bank: MusicBankSet.BK_9D_GM08, instrument: 0xF, name: "Vox Lead C5" },

            { bank: MusicBankSet.BK_9E_GM09, instrument: 0x4, name: "Sine Wave C6" },
            { bank: MusicBankSet.BK_9E_GM09, instrument: 0x5, name: "Sine Wave C8" },

            { bank: MusicBankSet.BK_9E_GM09, instrument: 0xD, name: "Dist. Lead C4" },

            { bank: MusicBankSet.BK_9F_GM10, instrument: 0x8, name: "Cheese Saw 1 C5" },
            { bank: MusicBankSet.BK_9F_GM10, instrument: 0x9, name: "Cheese Saw 1 C6" },

            { bank: MusicBankSet.BK_A0_GM11, instrument: 0x0, name: "Clear Bells C7" },
            { bank: MusicBankSet.BK_A0_GM11, instrument: 0x1, name: "Clear Bells C8" },
        ],
    },
    {
        name: "Ethnic",
        instruments: [
            { bank: MusicBankSet.BK_9E_GM09, instrument: 0x7, name: "Kalimba C5" },
            { bank: MusicBankSet.BK_9A_GM05, instrument: 0x6, name: "Kalimba C7" },

            { bank: MusicBankSet.BK_9B_GM06, instrument: 0x5, name: "Banjo C5" },

            { bank: MusicBankSet.BK_9B_GM06, instrument: 0x6, name: "Shanai C4" },
            { bank: MusicBankSet.BK_9B_GM06, instrument: 0x7, name: "Shanai C5" },
            { bank: MusicBankSet.BK_9B_GM06, instrument: 0x8, name: "Shanai C6" },

            { bank: MusicBankSet.BK_9C_GM07, instrument: 0x6, name: "Sitar C4" },
            { bank: MusicBankSet.BK_9C_GM07, instrument: 0x7, name: "Sitar C5" },
            { bank: MusicBankSet.BK_9E_GM09, instrument: 0x6, name: "Sitar C6" },
        ],
    },
    {
        name: "Percussive",
        instruments: [
            { bank: MusicBankSet.BK_9A_GM05, instrument: 0xA, name: "Steel Drums C5" },
            { bank: MusicBankSet.BK_9A_GM05, instrument: 0xB, name: "Steel Drums C6" },
            { bank: MusicBankSet.BK_9A_GM05, instrument: 0xC, name: "Steel Drums C7" },

            { bank: MusicBankSet.BK_9E_GM09, instrument: 0xC, name: "Gamelan C5" },

            { bank: MusicBankSet.BK_A0_GM11, instrument: 0x4, name: "Reverse Cym. C5" },
        ],
    },
    {
        name: "Drum Kit",
        instruments: [
            { bank: MusicBankSet.BK_9F_GM10, instrument: 0xA, name: "TR-909 Kick 1" },
            { bank: MusicBankSet.BK_9F_GM10, instrument: 0xB, name: "TR-909 Snare 2" },

            { bank: MusicBankSet.BK_9F_GM10, instrument: 0xD, name: "DUPLICATE: 0xB1", visible: false },

            { bank: MusicBankSet.BK_9F_GM10, instrument: 0xE, name: "Jazz Kick 1" },

            { bank: MusicBankSet.BK_90_PS01, instrument: 0x0, name: "STANDARD 1 Standard 1 Kick 1" },
            { bank: MusicBankSet.BK_90_PS01, instrument: 0x1, name: "STANDARD 1 Standard 1 Snare 1" },
            { bank: MusicBankSet.BK_90_PS01, instrument: 0x2, name: "STANDARD 1 Standard 1 Snare 2" },
            { bank: MusicBankSet.BK_90_PS01, instrument: 0x3, name: "STANDARD 1 Closed Hi-Hat" },
            { bank: MusicBankSet.BK_90_PS01, instrument: 0x4, name: "STANDARD 1 Pedal Hi-Hat" },
            { bank: MusicBankSet.BK_90_PS01, instrument: 0x5, name: "STANDARD 1 Open Hi-Hat" },
            { bank: MusicBankSet.BK_90_PS01, instrument: 0x6, name: "STANDARD 1 Crash Cymbal 1" },
            { bank: MusicBankSet.BK_90_PS01, instrument: 0x7, name: "STANDARD 1 Crash Cymbal 2" },
            { bank: MusicBankSet.BK_90_PS01, instrument: 0x8, name: "STANDARD 1 High Tom 1" },
            { bank: MusicBankSet.BK_90_PS01, instrument: 0x9, name: "STANDARD 1 High Tom 2" },
            { bank: MusicBankSet.BK_90_PS01, instrument: 0xA, name: "STANDARD 1 Mid Tom 1" },
            { bank: MusicBankSet.BK_90_PS01, instrument: 0xB, name: "STANDARD 1 Mid Tom 2" },
            { bank: MusicBankSet.BK_90_PS01, instrument: 0xC, name: "STANDARD 1 Low Tom 1" },
            { bank: MusicBankSet.BK_90_PS01, instrument: 0xD, name: "STANDARD 1 Low Tom 2" },
            { bank: MusicBankSet.BK_90_PS01, instrument: 0xE, name: "STANDARD 1 Ride Cymbal 1" },
            { bank: MusicBankSet.BK_90_PS01, instrument: 0xF, name: "STANDARD 1 Ride Bell" },

            { bank: MusicBankSet.BK_91_PS02, instrument: 0x0, name: "ORCHESTRA Concert BD 1" },
            { bank: MusicBankSet.BK_91_PS02, instrument: 0x1, name: "ORCHESTRA Concert SD" },
            { bank: MusicBankSet.BK_91_PS02, instrument: 0x2, name: "ORCHESTRA Concert Cymbal 1" },

            { bank: MusicBankSet.BK_91_PS02, instrument: 0x3, name: "HIP-HOP Hip-Hop Kick 2" },

            { bank: MusicBankSet.BK_91_PS02, instrument: 0x4, name: "ELECTRONIC Electric Kick 2" },

            { bank: MusicBankSet.BK_91_PS02, instrument: 0x5, name: "DANCE House Snare" },

            { bank: MusicBankSet.BK_91_PS02, instrument: 0x6, name: "ROOM Room Kick 2" },
            { bank: MusicBankSet.BK_91_PS02, instrument: 0x7, name: "ROOM Room Kick 1" },
            { bank: MusicBankSet.BK_91_PS02, instrument: 0x8, name: "ROOM Room Snare 1" },

            { bank: MusicBankSet.BK_91_PS02, instrument: 0x9, name: "TR-808 TR-808 Kick 2" },
            { bank: MusicBankSet.BK_91_PS02, instrument: 0xA, name: "TR-808 TR-808 Kick 1" },
            { bank: MusicBankSet.BK_91_PS02, instrument: 0xB, name: "TR-808 TR-808 Snare 1" },
            { bank: MusicBankSet.BK_91_PS02, instrument: 0xC, name: "TR-808 TR-808 Snare 2" },
            { bank: MusicBankSet.BK_91_PS02, instrument: 0xE, name: "TR-808 TR-808 Open Hi-Hat" },

            { bank: MusicBankSet.BK_92_PS03, instrument: 0x0, name: "STANDARD 1 Low Bongo" },
            { bank: MusicBankSet.BK_92_PS03, instrument: 0x1, name: "STANDARD 1 High Bongo" },
            { bank: MusicBankSet.BK_92_PS03, instrument: 0x2, name: "STANDARD 1 Open Cuica" },
            { bank: MusicBankSet.BK_92_PS03, instrument: 0x3, name: "STANDARD 1 Mute Cuica" },
            { bank: MusicBankSet.BK_92_PS03, instrument: 0x4, name: "STANDARD 1 Tambourine" },
            { bank: MusicBankSet.BK_92_PS03, instrument: 0x5, name: "STANDARD 1 Open Triangle" },
            { bank: MusicBankSet.BK_92_PS03, instrument: 0x6, name: "STANDARD 1 Low Conga" },
            { bank: MusicBankSet.BK_92_PS03, instrument: 0x7, name: "STANDARD 1 Open High Conga" },
            { bank: MusicBankSet.BK_92_PS03, instrument: 0x8, name: "STANDARD 1 Mute High Conga" },
            { bank: MusicBankSet.BK_92_PS03, instrument: 0x9, name: "STANDARD 1 High Timbale" },
            { bank: MusicBankSet.BK_92_PS03, instrument: 0xA, name: "STANDARD 1 Low Timbale" },
            { bank: MusicBankSet.BK_92_PS03, instrument: 0xB, name: "STANDARD 1 Long Guiro" },
            { bank: MusicBankSet.BK_92_PS03, instrument: 0xC, name: "STANDARD 1 Short Guiro" },
            { bank: MusicBankSet.BK_92_PS03, instrument: 0xD, name: "STANDARD 1 Cabasa" },
            { bank: MusicBankSet.BK_92_PS03, instrument: 0xE, name: "STANDARD 1 Castanets" },

            { bank: MusicBankSet.BK_92_PS03, instrument: 0xF, name: "DUPLICATE: 0xBB", visible: false },

            { bank: MusicBankSet.BK_93_PS04, instrument: 0x0, name: "STANDARD 1 Claves" },
            { bank: MusicBankSet.BK_93_PS04, instrument: 0x1, name: "STANDARD 1 Cowbell" },
            { bank: MusicBankSet.BK_93_PS04, instrument: 0x2, name: "STANDARD 1 High Agogo" },
            { bank: MusicBankSet.BK_93_PS04, instrument: 0x3, name: "STANDARD 1 Low Agogo" },
            { bank: MusicBankSet.BK_93_PS04, instrument: 0x4, name: "STANDARD 1 High Wood Block" },
            { bank: MusicBankSet.BK_93_PS04, instrument: 0x5, name: "STANDARD 1 Low Wood Block" },
            { bank: MusicBankSet.BK_93_PS04, instrument: 0x6, name: "STANDARD 1 Long Low Whistle" },
            { bank: MusicBankSet.BK_93_PS04, instrument: 0x7, name: "STANDARD 1 Shaker" },
            { bank: MusicBankSet.BK_93_PS04, instrument: 0x8, name: "STANDARD 1 Maracas" },

            { bank: MusicBankSet.BK_93_PS04, instrument: 0x9, name: "STANDARD 2 Hand Clap" },

            { bank: MusicBankSet.BK_93_PS04, instrument: 0xA, name: "STANDARD 1 TR-909 Hand Clap" },
            { bank: MusicBankSet.BK_93_PS04, instrument: 0xB, name: "STANDARD 1 Sticks" },
            { bank: MusicBankSet.BK_93_PS04, instrument: 0xC, name: "STANDARD 1 Side Stick" },
            { bank: MusicBankSet.BK_93_PS04, instrument: 0xD, name: "STANDARD 1 Vibra-Slap" },
            { bank: MusicBankSet.BK_93_PS04, instrument: 0xF, name: "STANDARD 1 Snare Roll" },

            { bank: MusicBankSet.BK_94_PS05, instrument: 0x6, name: "SFX Heart Beat" },

            { bank: MusicBankSet.BK_94_PS05, instrument: 0x7, name: "STANDARD 1 Bell Tree" },
            { bank: MusicBankSet.BK_94_PS05, instrument: 0x8, name: "STANDARD 1 Jingle Bell" },
            { bank: MusicBankSet.BK_94_PS05, instrument: 0x9, name: "STANDARD 1 Chinese Cymbal" },
            { bank: MusicBankSet.BK_94_PS05, instrument: 0xA, name: "STANDARD 1 Open Surdo" },
            { bank: MusicBankSet.BK_94_PS05, instrument: 0xB, name: "STANDARD 1 Mute Surdo" },

            { bank: MusicBankSet.BK_94_PS05, instrument: 0xC, name: "POWER Power Snare 1" },
            { bank: MusicBankSet.BK_94_PS05, instrument: 0xD, name: "POWER Power Kick 1" },
            { bank: MusicBankSet.BK_94_PS05, instrument: 0xE, name: "POWER Power Mid Tom 2" },

            { bank: MusicBankSet.BK_94_PS05, instrument: 0xF, name: "DUPLICATE: 0xB0", visible: false },
        ],
    },
]

const definedInstruments = new Set<string>()
for (const category of baseCategories) {
    for (const instrument of category.instruments) {
        definedInstruments.add(`${instrument.bank}:${instrument.instrument}`)
    }
}

const undefinedInstruments = []
for (const bank of Object.values(MusicBankSet)) {
    if (typeof bank !== "number") continue

    for (let instrument = 0; instrument < 16; instrument++) {
        const key = `${bank}:${instrument}`
        if (definedInstruments.has(key)) continue

        const bankName = MusicBankSet[bank]
        const instrumentHex = instrument.toString(16).toUpperCase()

        undefinedInstruments.push({
            bank,
            instrument,
            name: `[${bankName}/${instrumentHex}]`,
        })
    }
}

export const categories = [
    ...baseCategories,
    {
        name: "Uncategorized",
        instruments: undefinedInstruments,
    },
]

export function getName({ bank_set, bank, instrument }: PatchAddress): string {
    if (bank_set === "Music") {
        for (const category of categories) {
            for (const instrumentEntry of category.instruments) {
                if (instrumentEntry.bank === bank && instrumentEntry.instrument === instrument) {
                    return instrumentEntry.name
                }
            }
        }
    }

    const bankHex = bank.toString(16).toUpperCase()
    const instrumentHex = instrument.toString(16).toUpperCase()
    return `[${bank_set} ${bankHex}/${instrumentHex}]`
}
