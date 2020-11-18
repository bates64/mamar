#![feature(seek_convenience)] // Requires nightly Rust

/// Encoder (Bgm -> .bin)
pub mod en;

/// Decoder (.bin -> Bgm)
pub mod de;

pub const MAGIC: &[u8; 4] = b"BGM ";

#[derive(Clone, Default, PartialEq, Eq, Debug)]
pub struct Bgm {
    pub name: [u8; 4], // ASCII
    pub segments: [Vec<Segment>; 4],
    // TODO: percussion, instruments
}

#[derive(Clone, Default, PartialEq, Eq, Debug)]
pub struct Segment {
    pub flags: u16, // TODO: better representation (bitfields? enum?)
    pub tracks: Option<[Track; 16]>,
}

#[derive(Clone, Default, PartialEq, Eq, Debug)]
pub struct Track {
    pub flags: u16, // TODO: better representation
    pub commands: u32, // TODO
}

impl Segment {
    fn is_terminator(&self) -> bool {
        true
    }
}

/// Aligns a value to the next multiple of n.
fn align(value: u32, n: u32) -> u32 {
    if value % n == 0 {
        n
    } else {
        value + (n - value % n)
    }
}
