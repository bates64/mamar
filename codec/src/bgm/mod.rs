use std::{ops::Deref, rc::Rc};
use tinystr::{tinystr4, TinyStr4};

/// Encoder ([Bgm] -> .bin)
pub mod en;

/// Decoder (.bin -> [Bgm])
pub mod de;

mod cmd;
pub use cmd::*;

/// Constant signature string which appears at the start of every binary BGM file.
pub const MAGIC: &[u8; 4] = b"BGM ";

#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Bgm {
    /// ASCII song index.
    pub index: TinyStr4,

    pub segments: [Option<Segment>; 4],

    pub drums: Vec<Drum>,
    pub voices: Vec<Voice>,
}

impl Default for Bgm {
    fn default() -> Self {
        Self {
            index: tinystr4!("xxx "), // TODO: check engine accepts this
            segments: [None, None, None, None],
            drums: Vec::new(),
            voices: Vec::new(),
        }
    }
}

type Segment = Vec<Subsegment>;

// TODO: better representation for `flags`
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum Subsegment {
    Tracks {
        flags: u8,
        tracks: TaggedRc<[Track; 16]>,
    },
    Unknown {
        flags: u8,
        data: [u8; 3], // Is this always padding?
    },
}

#[derive(Clone, Default, PartialEq, Eq, Debug)]
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

#[derive(Clone, Default, PartialEq, Eq, Debug)]
pub struct Drum {
    pub bank: u8,
    pub patch: u8,
    pub coarse_tune: u8,
    pub fine_tune: u8,
    pub volume: u8,
    pub pan: u8,
    pub reverb: u8,
    pub unk_07: u8,

    // The following are possibly just padding, or they just have unused uses. Needs testing
    pub unk_08: u8, // Unused; zero in all original songs
    pub unk_09: u8, // Unused
    pub unk_0a: u8, // Unused
    pub unk_0b: u8, // Unused
}

#[derive(Clone, Default, PartialEq, Eq, Debug)]
pub struct Voice {
    pub bank: u8,
    pub patch: u8,
    pub volume: u8,
    pub pan: u8,
    pub reverb: u8,
    pub coarse_tune: u8,
    pub fine_tune: u8,
    pub unk_07: u8,
}

#[derive(Clone, Default, PartialEq, Eq, Debug)]
pub struct TaggedRc<T> {
    /// The original file position T was decoded from.
    pub decoded_pos: Option<u64>,
    pub rc: Rc<T>,
}

impl<T> Deref for TaggedRc<T> {
    type Target = Rc<T>;

    fn deref(&self) -> &Self::Target {
        &self.rc
    }
}
