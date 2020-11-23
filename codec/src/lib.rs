#![feature(seek_convenience, map_into_keys_values, iter_map_while)] // Requires nightly Rust

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
    // TODO: percussion, voices (instruments)
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
    if n <= 1 {
        return value;
    }

    if value % n == 0 {
        n
    } else {
        value + (n - value % n)
    }
}

#[test]
fn test_align() {
    assert_eq!(align(0, 5), 5);
    assert_eq!(align(5, 5), 5);
    assert_eq!(align(6, 5), 10);

    // 0 and 1 values for `n` should be a no-op
    assert_eq!(align(36, 0), 36);
    assert_eq!(align(36, 1), 36);
}
