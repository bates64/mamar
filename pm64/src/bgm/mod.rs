/// Encoder ([Bgm] -> .bin)
pub mod en;

/// Decoder (.bin -> [Bgm])
pub mod de;

#[cfg(feature = "midly")]
pub mod midi;

use std::collections::HashMap;
use std::ops::Range;

use serde_derive::{Deserialize, Serialize};
use typescript_type_def::TypeDef;

mod cmd;
pub use cmd::*;

use crate::id::Id;

/// Constant signature string which appears at the start of every binary BGM file.
pub const MAGIC: &str = "BGM ";

/// An offset relative to the beginning of the decoded/encoded BGM.
pub type FilePos = u64;

pub type TrackListId = u64;

#[derive(Clone, Default, Debug, PartialEq, Eq, Serialize, Deserialize, TypeDef)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct Bgm {
    pub name: String,

    pub variations: [Option<Variation>; 4],

    pub drums: Vec<Drum>,
    pub instruments: Vec<Instrument>,

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

    pub fn can_add_variation(&self) -> bool {
        self.variations.iter().any(|s| s.is_none())
    }

    pub fn add_variation(&mut self) -> Result<(usize, &mut Variation), NoSpace> {
        let empty_seg: Option<(usize, &mut Option<Variation>)> =
            self.variations.iter_mut().enumerate().find(|(_, s)| s.is_none());

        match empty_seg {
            None => Err(NoSpace),
            Some((idx, slot)) => {
                *slot = Some(Variation {
                    segments: Default::default(),
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

        debug_assert!(!self.track_lists.contains_key(&id));

        self.track_lists.insert(id, track_list);
        id
    }
}

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize, TypeDef)]
#[serde(rename_all = "camelCase")]
pub struct Variation {
    pub segments: Vec<Segment>,
}

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize, TypeDef)]
#[serde(tag = "type")]
pub enum Segment {
    #[serde(rename_all = "camelCase")]
    Subseg {
        id: Id,
        track_list: TrackListId,
    },
    StartLoop {
        id: Id,
        label_index: u16,
    },
    Wait {
        id: Id,
    },
    EndLoop {
        id: Id,
        label_index: u8,
        iter_count: u8,
    },
    Unknown6 {
        id: Id,
        label_index: u8,
        iter_count: u8,
    },
    Unknown7 {
        id: Id,
        label_index: u8,
        iter_count: u8,
    },
}

mod segment_commands {
    pub const END: u32 = 0;
    pub const SUBSEG: u32 = 1 << 16;
    pub const START_LOOP: u32 = 3 << 16;
    pub const WAIT: u32 = 4 << 16;
    pub const END_LOOP: u32 = 5 << 16;
    pub const UNKNOWN_6: u32 = 6 << 16;
    pub const UNKNOWN_7: u32 = 7 << 16;
}

#[derive(Clone, Default, PartialEq, Eq, Debug, Serialize, Deserialize, TypeDef)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct TrackList {
    /// Encode/decode file position.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pos: Option<FilePos>,

    pub tracks: [Track; 16],
}

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize, TypeDef)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub is_disabled: bool,
    pub polyphonic_idx: u8,
    pub is_drum_track: bool,
    pub parent_track_idx: u8,
    pub commands: CommandSeq,
}

/// 255 is never used in vanilla songs so we can repurpose it to mean 'please calculate a good polyphonic_idx for me'
pub const POLYPHONIC_IDX_AUTO_MAMAR: u8 = 255;

impl Default for Track {
    fn default() -> Self {
        Self {
            is_disabled: true,
            polyphonic_idx: POLYPHONIC_IDX_AUTO_MAMAR,
            is_drum_track: false,
            parent_track_idx: 0,
            commands: Default::default(),
        }
    }
}

#[derive(Clone, Default, PartialEq, Eq, Debug, Serialize, Deserialize, TypeDef)]
#[serde(rename_all = "camelCase")]
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
    pub rand_tune: u8,
    pub rand_volume: u8,
    pub rand_pan: u8,
    pub rand_reverb: u8,

    #[serde(skip_serializing_if = "is_default")]
    pub pad_0b: u8,
}

#[derive(Clone, Default, PartialEq, Eq, Debug, Serialize, Deserialize, TypeDef)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct Instrument {
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

    #[serde(skip_serializing_if = "is_default")]
    pub pad_07: u8,
}

#[derive(Clone, PartialEq, Eq, Debug, Default)]
pub struct Unknown {
    pub range: Range<u64>,
    pub data: Vec<u8>,
}

fn is_default<T: Default + PartialEq>(t: &T) -> bool {
    t == &T::default()
}
