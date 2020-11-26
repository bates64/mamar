use std::{ops::Deref, rc::Rc, io::{self, prelude::*, SeekFrom}};
use tinystr::{tinystr4, TinyStr4};

/// Encoder ([Bgm] -> .bin)
mod en;

/// Decoder (.bin -> [Bgm])
mod de;
pub use de::Error as DecodeError;

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

trait SeekExt: Seek {
    fn pos(&mut self) -> io::Result<u64>;
}

impl<S: Seek> SeekExt for S {
    fn pos(&mut self) -> io::Result<u64> {
        self.seek(SeekFrom::Current(0))
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

#[cfg(test)]
mod test {
    use super::*;


    #[test]
    fn test_align() {
        assert_eq!(align(0, 5), 5);
        assert_eq!(align(5, 5), 5);
        assert_eq!(align(6, 5), 10);

        // 0 and 1 values for `n` should be a no-op
        assert_eq!(align(36, 0), 36);
        assert_eq!(align(36, 1), 36);
    }
}
