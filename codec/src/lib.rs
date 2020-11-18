#![feature(seek_convenience)] // Requires nightly Rust

/// Encoder (Bgm -> .bin)
pub mod en;

/// Decoder (.bin -> Bgm)
pub mod de;

pub const MAGIC: &[u8; 4] = b"BGM ";

#[derive(Clone, Default, PartialEq, Eq, Debug)]
pub struct Bgm {
    pub name: [u8; 4], // ASCII
    pub segments: [Option<Segment>; 4],
    // TODO: percussion, instruments
}

type Segment = Vec<Subsegment>;

// TODO: better representation for `flags`
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum Subsegment {
    Tracks {
        flags: u8,
        tracks: [Track; 16],
    },
    Unknown {
        flags: u8,
        data: [u8; 3], // Is this always padding?
    },
}

#[derive(Clone, Default, PartialEq, Eq, Debug)]
pub struct Track {
    pub flags: u16, // TODO: better representation
    pub commands: Vec<Command>,
}

type Command = u8; // TODO

impl Subsegment {
    pub fn flags(&self) -> u8 {
        match *self {
            Subsegment::Tracks  { flags, .. } => flags,
            Subsegment::Unknown { flags, .. } => flags,
        }
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
