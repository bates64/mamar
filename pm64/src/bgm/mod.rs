pub mod voice;

/// Encoder ([Bgm] -> .bin)
pub mod en;

/// Decoder (.bin -> [Bgm])
pub mod de;

#[cfg(feature = "midly")]
pub mod midi;

use std::ops::Range;
use std::collections::HashMap;

use serde_derive::{Serialize, Deserialize};
use typescript_type_def::TypeDef;

mod cmd;
pub use cmd::*;

/// Constant signature string which appears at the start of every binary BGM file.
pub const MAGIC: &str = "BGM ";

/// An offset relative to the beginning of the decoded/encoded BGM.
pub type FilePos = u64;

pub type TrackListId = u64;

#[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize, TypeDef)]
#[serde(default)]
pub struct Bgm {
    pub name: String,

    #[serde(rename = "variations")]
    pub segments: [Option<Segment>; 4],

    pub drums: Vec<Drum>,
    pub voices: Vec<Voice>,

    pub track_lists: HashMap<TrackListId, TrackList>,

    #[serde(skip)]
    pub unknowns: Vec<Unknown>,
}

#[derive(Clone, Default, Copy, PartialEq, Eq, Debug)]
pub struct NoSpace;

impl Bgm {
    pub fn new() -> Bgm {
        Bgm {
            name: "New Song".to_string(),
            ..Default::default()
        }
    }

    pub fn can_add_segment(&self) -> bool {
        self.segments.iter().any(|s| s.is_none())
    }

    pub fn add_segment(&mut self) -> Result<(usize, &mut Segment), NoSpace> {
        let empty_seg: Option<(usize, &mut Option<Segment>)> = self.segments
            .iter_mut()
            .enumerate()
            .find(|(_, s)| s.is_none());

        match empty_seg {
            None => Err(NoSpace),
            Some((idx, slot)) => {
                *slot = Some(Segment {
                    name: format!("Variation {}", idx + 1),
                    subsegments: Default::default(),
                });
                Ok((idx, slot.as_mut().unwrap()))
            }
        }
    }

    pub fn find_track_list_with_pos(&self, pos: FilePos) -> Option<TrackListId> {
        self.track_lists
            .iter()
            .find(|(_, track)| track.pos == Some(pos))
            .map(|(id, _)| *id)
    }

    pub fn add_track_list(&mut self, track_list: TrackList) -> TrackListId {
        let mut max_id = 0;

        for id in self.track_lists.keys() {
            if *id > max_id {
                max_id = *id;
            }
        }

        let id = max_id.wrapping_add(1);

        debug_assert!(self.track_lists.get(&id).is_none());

        self.track_lists.insert(id, track_list);
        id
    }
}

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize, TypeDef)]
pub struct Segment {
    /// Not encoded in BGM data.
    pub name: String,

    #[serde(rename = "sections")]
    pub subsegments: Vec<Subsegment>,
}

// TODO: better representation for `flags`
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize, TypeDef)]
pub enum Subsegment {
    Tracks {
        flags: u8,
        track_list: TrackListId,
    },
    Unknown {
        flags: u8,
        data: [u8; 3],
    },
}

#[derive(Clone, Default, PartialEq, Eq, Debug, Serialize, Deserialize, TypeDef)]
#[serde(default)]
pub struct TrackList {
    /// Not encoded in BGM data.
    pub name: String,

    /// Encode/decode file position.
    #[serde(skip_serializing_if="Option::is_none")]
    pub pos: Option<FilePos>,

    pub tracks: [Track; 16],
}

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize, TypeDef)]
#[serde(default)]
pub struct Track {
    pub name: String,

    pub flags: u16, // TODO: better representation
    pub commands: CommandSeq,

    #[serde(skip_serializing_if="is_default")]
    pub mute: bool,

    #[serde(skip_serializing_if="is_default")]
    pub solo: bool,
}

impl Subsegment {
    pub fn flags(&self) -> u8 {
        match *self {
            Subsegment::Tracks { flags, .. } => flags,
            Subsegment::Unknown { flags, .. } => flags,
        }
    }
}

#[derive(Clone, Default, PartialEq, Eq, Debug, Serialize, Deserialize, TypeDef)]
#[serde(default)]
pub struct Drum {
    pub bank: u8,
    pub patch: u8,
    pub coarse_tune: u8,
    pub fine_tune: u8,
    pub volume: u8,

    /// Left = 0
    /// Middle = 64
    /// Right = 128
    pub pan: i8,

    pub reverb: u8,

    #[serde(skip_serializing_if="is_default")]
    pub unk_07: u8,

    // The following are possibly just padding, or they just have unused uses. Needs testing
    #[serde(skip_serializing_if="is_default")]
    pub unk_08: u8, // Unused; zero in all original songs
    #[serde(skip_serializing_if="is_default")]
    pub unk_09: u8, // Unused
    #[serde(skip_serializing_if="is_default")]
    pub unk_0a: u8, // Unused
    #[serde(skip_serializing_if="is_default")]
    pub unk_0b: u8, // Unused
}

#[derive(Clone, Default, PartialEq, Eq, Debug, Serialize, Deserialize, TypeDef)]
#[serde(default)]
pub struct Voice {
    /// Upper nibble = bank. (0..=6 are valid?)
    /// Lower nibble = staccatoness mod 3 (0 = sustain, 3 = staccato).
    pub bank: u8,

    pub patch: u8,
    pub volume: u8,

    /// Values are just like in MIDI:
    /// Left = 0.
    /// Middle = (+/-)64.
    /// Right = (+/-)127.
    pub pan: i8,

    pub reverb: u8,
    pub coarse_tune: u8,
    pub fine_tune: u8,

    #[serde(skip_serializing_if="is_default")]
    pub unk_07: u8,
}

#[derive(Clone, PartialEq, Eq, Debug, Default)]
pub struct Unknown {
    pub range: Range<u64>,
    pub data: Vec<u8>,
}

impl Track {
    pub fn get_flag(&self, flag: u16) -> bool {
        (self.flags & flag) != 0
    }

    pub fn set_flag(&mut self, flag: u16, enable: bool) {
        if enable {
            self.flags |= flag;
        } else {
            self.flags &= !flag;
        }
    }
}

impl Default for Track {
    fn default() -> Self {
        Track {
            name: String::from("New Track"),
            flags: 0x0000,
            mute: false,
            solo: false,
            commands: CommandSeq::default(),
        }
    }
}

pub mod track_flags {
    pub const DRUM_TRACK: u16  = 0x0080;
    pub const LOW_PITCH: u16   = 0x1000; // May be wrong
    pub const POLYPHONY_1: u16 = 0x2000;
    pub const POLYPHONY_2: u16 = 0x4000;
    pub const POLYPHONY_3: u16 = 0x8000;
}

fn is_default<T: Default + PartialEq>(t: &T) -> bool {
    t == &T::default()
}

impl TrackList {
    pub fn silence_skip(&mut self) {
        for track in &mut self.tracks {
            track.mute = true;
            track.solo = false;
            track.commands.zero_all_delays();
        }
    }
}
