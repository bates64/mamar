use std::collections::{BTreeMap};

use lazy_static::lazy_static;

lazy_static! {
    /// name -> (upper bank, patch)
    pub static ref INSTRUMENTS_BY_NAME: BTreeMap<&'static str, (u8, u8)> = {
        let mut m = BTreeMap::new();
        /*
        m.insert("Synth Bass 1", (0, 0));
        m.insert("Air Blow", (0, 1));
        m.insert("Whistle Slap", (0, 2));
        m.insert("Synth Pluck", (0, 3));
        */

        m.insert("Funny Marimba", (3, 0x01));
        m.insert("Marimba", (3, 0x02));
        m.insert("Huff n' Puff Synth [Lead 4 (chiff)]", (3, 0x0B));

        m.insert("String Ensemble", (3, 0x18));
        m.insert("Synth String 1", (3, 0x19));
        m.insert("Synth String 2", (3, 0x1A));
        m.insert("Synth Flute (?)", (3, 0x1B));

        m.insert("Synth Flute", (3, 0x2E));

        m.insert("Synth Brass 2", (3, 0x3F));

        m.insert("Overdriven Guitar", (3, 0x44));

        m.insert("Kalimba", (3, 0x46));
        m.insert("Flute 2", (3, 0x46));

        m.insert("Percussive(?) Organ", (3, 0x4D));
        m.insert("Drawbar Organ A", (3, 0x4E));
        m.insert("Drawbar Organ B", (3, 0x4F));
        m.insert("Guitar Harmonics", (3, 0x52));
        m.insert("Percussive Organ", (3, 0x54));
        m.insert("Sitar 3", (3, 0x55));

        m.insert("Muted Trumpet", (3, 0x58));
        m.insert("Choir A [Lead 6 (voice)]", (3, 0x59));
        m.insert("Choir B", (3, 0x5A));
        m.insert("Choir C", (3, 0x5B));
        m.insert("Rock Organ", (3, 0x63));
        m.insert("Muted Synth Bass", (3, 0x65));
        m.insert("Synth Bass 1", (3, 0x69));
        m.insert("Fat Synth Brass", (3, 0x6A));
        m.insert("Synth Brass 2", (3, 0x6B));
        m.insert("Whistle", (3, 0x6C));
        m.insert("Blown Bottle", (3, 0x6E));
        m.insert("Shooting Star Pad", (3, 0x70));
        m.insert("Music Box (weird)", (3, 0x79));
        m.insert("Alien Xylophone", (3, 0x7A));
        m.insert("Glockenspiel 1", (3, 0x80));
        m.insert("Glockenspiel 2", (3, 0x81));
        m.insert("Dulcimer", (3, 0x83));
        m.insert("Sitar 2", (3, 0x86));
        m.insert("Flute", (3, 0x8A));
        m.insert("Distortion Strings", (3, 0x8D));

        m.insert("Mosquito", (3, 0x98));
        m.insert("Cat [Lead 8 (bass + lead)]", (3, 0x99));
        m.insert("Music Box", (3, 0xA1));
        m.insert("Synth Voice", (3, 0xA5));

        m.insert("Woodblock", (3, 0xE4));

        m
    };

    pub static ref INSTRUMENTS_BY_ID: BTreeMap<(u8, u8), &'static str> = {
        let mut m = BTreeMap::new();
        for (k, v) in INSTRUMENTS_BY_NAME.iter() {
            m.insert(*v, *k);
        }
        m
    };
}
