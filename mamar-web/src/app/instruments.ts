export const categories = [
    {
        name: "Keyboard",
        instruments: [
            { bank: 0x03, patch: 0x0E, name: "Old School Piano" },
            { bank: 0x03, patch: 0x0F, name: "Bright Piano" },
            { bank: 0x03, patch: 0x20, name: "Electric Piano 1A" },
            { bank: 0x03, patch: 0x21, name: "Electric Piano 1B" },
            { bank: 0x03, patch: 0x22, name: "Electric Piano 2" },
            { bank: 0x03, patch: 0x23, name: "Acoustic Piano 1" },
            { bank: 0x03, patch: 0x24, name: "Acoustic Piano 2" },
            { bank: 0x03, patch: 0x00, name: "Marimba 1" },
            { bank: 0x03, patch: 0x01, name: "Marimba 2" },
            { bank: 0x03, patch: 0x02, name: "Marimba 3" },
            { bank: 0x03, patch: 0x03, name: "Xylophone 1" },
            { bank: 0x03, patch: 0x04, name: "Xylophone 2" },
            { bank: 0x03, patch: 0x05, name: "Xylophone 3" },
            { bank: 0x03, patch: 0x0F, name: "Xylophone 4" },
            { bank: 0x03, patch: 0x06, name: "Vibraphone 1" },
            { bank: 0x03, patch: 0x07, name: "Vibraphone 2" },
            { bank: 0x03, patch: 0x08, name: "Vibraphone 3" },
            { bank: 0x03, patch: 0x09, name: "Celesta 1" },
            { bank: 0x03, patch: 0x0A, name: "Celesta 2" },
            { bank: 0x03, patch: 0x25, name: "Music Box 1" },
            { bank: 0x03, patch: 0x26, name: "Music Box 2" },
        ],
    },
    {
        name: "String",
        instruments: [
            { bank: 0x03, patch: 0x10, name: "Cello" },
            { bank: 0x03, patch: 0x11, name: "Viola" },
            { bank: 0x03, patch: 0x12, name: "Violin 1" },
            { bank: 0x03, patch: 0x13, name: "Violin 2" },
            { bank: 0x03, patch: 0x14, name: "Pizzicato Strings 1A" },
            { bank: 0x03, patch: 0x15, name: "Pizzicato Strings 1B" },
            { bank: 0x03, patch: 0x16, name: "Pizzicato Strings 2A" },
            { bank: 0x03, patch: 0x17, name: "Pizzicato Strings 2B" },
            { bank: 0x03, patch: 0x18, name: "String Ensemble" },
            { bank: 0x03, patch: 0x19, name: "Synth String 1" },
            { bank: 0x03, patch: 0x1A, name: "Synth String 2" },
            { bank: 0x03, patch: 0x29, name: "Acoustic Guitar 1A" },
            { bank: 0x03, patch: 0x2A, name: "Acoustic Guitar 1B" },
            { bank: 0x03, patch: 0x2B, name: "Acoustic Guitar 2A" },
            { bank: 0x03, patch: 0x2C, name: "Acoustic Guitar 2B" },
        ],
    },
    {
        name: "Wind",
        instruments: [
            { bank: 0x03, patch: 0x0B, name: "Huff n' Puff Synth 1" },
            { bank: 0x03, patch: 0x0C, name: "Huff n' Puff Synth 2" },
            { bank: 0x03, patch: 0x0D, name: "Huff n' Puff Synth 3" },
            { bank: 0x03, patch: 0x1B, name: "Synth Flute" },
        ],
    },
    {
        name: "Percussion",
        instruments: [
            { bank: 0x03, patch: 0x1C, name: "Timpani 1A" },
            { bank: 0x03, patch: 0x1D, name: "Timpani 1B" },
            { bank: 0x03, patch: 0x1E, name: "Timpani 2A" },
            { bank: 0x03, patch: 0x1F, name: "Timpani 2B" },
        ],
    },
    // TODO: onwards from 0x03,0x2D..
]

export function getName(bank: number, patch: number): string {
    for (const category of categories) {
        for (const instrument of category.instruments) {
            if (instrument.bank === bank && instrument.patch === patch) {
                return instrument.name
            }
        }
    }

    return ""
}
