#![feature(seek_convenience)] // Requires nightly Rust

use serde::{Serialize, Deserialize};

/// Encoder ([Bgm] -> .bin)
mod en;

/// Decoder (.bin -> [Bgm])
mod de;
pub use de::Error as DecodeError;

mod cmd;
pub use cmd::*;

/// Constant signature string which appears at the start of every binary BGM file.
pub const MAGIC: &[u8; 4] = b"BGM ";

#[derive(Serialize, Deserialize, Clone, Default, PartialEq, Eq, Debug)]
pub struct Bgm {
    // TODO: convert from/to string this when [de]serializing
    /// ASCII song index.
    pub name: [u8; 4],

    pub segments: [Option<Segment>; 4],
    // TODO: percussion, instruments
}

type Segment = Vec<Subsegment>;

// TODO: better representation for `flags`
#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Debug)]
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

#[derive(Serialize, Deserialize, Clone, Default, PartialEq, Eq, Debug)]
pub struct Track {
    pub flags: u16, // TODO: better representation
    pub commands: CommandSeq,
}

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
