/// Encoder ([Bgm] -> .bin)
pub mod en;

/// Decoder (.bin -> [Bgm])
pub mod de;

/// Mamar-specific editor metadata
pub mod mamar;

#[cfg(feature = "midly")]
pub mod midi;

use std::collections::BTreeMap;
use std::ops::Range;
use std::sync::LazyLock;

use regex::Regex;
use serde_derive::{Deserialize, Serialize};
use typescript_type_def::TypeDef;

mod cmd;
pub use cmd::*;

use crate::id::{gen_id, Id};

/// Constant signature string which appears at the start of every binary BGM file.
pub const MAGIC: &str = "BGM ";

/// An offset relative to the beginning of the decoded/encoded BGM.
pub type FilePos = u64;

/// The TrackLists HashMap is 1-indexed
pub type TrackListId = u64;

#[derive(Clone, Default, Debug, PartialEq, Eq, Serialize, Deserialize, TypeDef)]
#[serde(default)]
pub struct Bgm {
    pub name: String,

    pub variations: [Option<Variation>; 4],

    pub drums: Vec<Drum>,
    pub instruments: Vec<Instrument>,

    pub track_lists: BTreeMap<TrackListId, TrackList>,

    #[serde(skip)]
    pub unknowns: Vec<Unknown>,
}

#[derive(Clone, Default, Copy, PartialEq, Eq, Debug)]
pub struct NoSpace;

static RON_COMMAND_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"name:\s*".*"(?:.|\n)*?commands:\s*(\[(?:.|\n)*?\])"#).unwrap());

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

    /// Finds the segment playing at time `time` in variation `variation`, and splits it in two at `time`.
    /// If a segment already starts/ends at `time`, does nothing.
    pub fn split_variation_at(&mut self, variation: usize, time: usize) {
        if variation >= self.variations.len() {
            return;
        }
        let Some(variation_ref) = &self.variations[variation] else {
            return;
        };

        let mut current_time = 0;
        let mut new_track_list: Option<(usize, TrackList)> = None;
        for (i, segment) in variation_ref.segments.iter().enumerate() {
            let Segment::Subseg { track_list, .. } = segment else {
                continue;
            };

            let duration = self
                .track_lists
                .get(track_list)
                .map(|tl| tl.len_time())
                .unwrap_or_default();

            let seg_start = current_time;
            let seg_end = current_time + duration;

            if seg_start < time && time < seg_end {
                let Some(track_list) = self.track_lists.get_mut(track_list) else {
                    continue;
                };
                new_track_list = Some((i + 1, track_list.split_at(time - seg_start)));
                break;
            } else if seg_start == time || seg_end == time {
                return;
            }

            current_time += duration;
        }

        if let Some((idx, track_list)) = new_track_list {
            let track_list = self.add_track_list(track_list);
            self.variations[variation].as_mut().unwrap().segments.insert(
                idx,
                Segment::Subseg {
                    id: Some(gen_id()),
                    track_list,
                },
            )
        }
    }

    pub fn from_ron_string(input_string: &str) -> Result<Self, ron::Error> {
        // generate ids for commands
        let matches: Vec<regex::Captures<'_>> = RON_COMMAND_REGEX.captures_iter(&input_string).collect();
        let mut modified_input_string = input_string.to_string();

        for captures in matches.into_iter().rev() {
            let commands_group = captures.get(1).unwrap();
            let (_, [commands_str]) = captures.extract();

            let commands: Vec<Command> = ron::de::from_str(commands_str)?;
            let events: Vec<Event> = commands
                .into_iter()
                .map(|command| Event { id: gen_id(), command })
                .collect();

            modified_input_string.replace_range(
                commands_group.start()..commands_group.end(),
                &ron::ser::to_string(&events)?,
            );
        }

        let mut bgm = ron::from_str::<Bgm>(&modified_input_string)?;

        // generate ids for segments
        for variation in &mut bgm.variations {
            let Some(variation) = variation else {
                continue;
            };

            for segment in &mut variation.segments {
                segment.add_new_id();
            }
        }

        Ok(bgm)
    }

    pub fn to_ron_string(mut self) -> Result<String, ron::Error> {
        // strip segments of id
        for variation in &mut self.variations {
            let Some(variation) = variation else {
                continue;
            };

            for segment in &mut variation.segments {
                segment.strip_id();
            }
        }

        let pretty_config = ron::ser::PrettyConfig::new().indentor("  ").depth_limit(5);
        let bgm_string = ron::ser::to_string_pretty(&self, pretty_config.clone())?.to_string();

        // strip commands of id field
        let matches: Vec<regex::Captures<'_>> = RON_COMMAND_REGEX.captures_iter(&bgm_string).collect();
        let mut modified_bgm_string = bgm_string.clone();

        for captures in matches.into_iter().rev() {
            let events_group = captures.get(1).unwrap();
            let (_, [events_str]) = captures.extract();

            let events: Vec<Event> = ron::de::from_str(events_str)?;
            if events.is_empty() {
                continue;
            }

            let commands: Vec<Command> = events.into_iter().map(|event| event.command).collect();

            let mut commands_string = "[\n".to_owned();
            for line in ron::ser::to_string_pretty(&commands, pretty_config.clone().depth_limit(1))?
                .lines()
                .skip(1)
            {
                commands_string.push_str("        ");
                commands_string.push_str(line);
                commands_string.push('\n');
            }
            modified_bgm_string.replace_range(
                events_group.start()..events_group.end(),
                &commands_string[..commands_string.len() - 1],
            );
        }

        Ok(modified_bgm_string)
    }
}

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize, TypeDef)]
pub struct Variation {
    pub segments: Vec<Segment>,
}

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize, TypeDef)]
pub enum Segment {
    Subseg {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<Id>,
        track_list: TrackListId,
    },
    StartLoop {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<Id>,
        label_index: u16,
    },
    Wait {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<Id>,
    },
    EndLoop {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<Id>,
        label_index: u8,
        iter_count: u8,
    },
    Unknown6 {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<Id>,
        label_index: u8,
        iter_count: u8,
    },
    Unknown7 {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<Id>,
        label_index: u8,
        iter_count: u8,
    },
}

impl Segment {
    pub fn add_new_id(&mut self) {
        match self {
            Segment::Subseg { id, .. } => *id = Some(gen_id()),
            Segment::StartLoop { id, .. } => *id = Some(gen_id()),
            Segment::Wait { id } => *id = Some(gen_id()),
            Segment::EndLoop { id, .. } => *id = Some(gen_id()),
            Segment::Unknown6 { id, .. } => *id = Some(gen_id()),
            Segment::Unknown7 { id, .. } => *id = Some(gen_id()),
        }
    }

    pub fn strip_id(&mut self) {
        match self {
            Segment::Subseg { id, .. } => *id = None,
            Segment::StartLoop { id, .. } => *id = None,
            Segment::Wait { id } => *id = None,
            Segment::EndLoop { id, .. } => *id = None,
            Segment::Unknown6 { id, .. } => *id = None,
            Segment::Unknown7 { id, .. } => *id = None,
        }
    }
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
pub struct TrackList {
    /// Encode/decode file position.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pos: Option<FilePos>,

    pub tracks: [Track; 16],
}

impl TrackList {
    pub fn len_time(&self) -> usize {
        self.tracks[0].commands.len_time()
    }

    pub fn split_at(&mut self, time: usize) -> TrackList {
        TrackList {
            pos: None,
            tracks: {
                let mut new_tracks = [(); 16].map(|_| Track::default());
                for (i, track) in self.tracks.iter_mut().enumerate() {
                    new_tracks[i] = track.split_at(time);
                }
                new_tracks
            },
        }
    }
}

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize, TypeDef)]
#[serde(default)]
pub struct Track {
    #[serde(default)]
    pub name: String,
    pub is_disabled: bool,
    pub polyphony: Polyphony,
    pub is_drum_track: bool,
    pub commands: CommandSeq,
}

impl Default for Track {
    fn default() -> Self {
        Self {
            name: "".to_owned(),
            is_disabled: true,
            polyphony: Polyphony::Automatic,
            is_drum_track: false,
            commands: Default::default(),
        }
    }
}

impl Track {
    pub fn split_at(&mut self, time: usize) -> Track {
        Track {
            name: self.name.clone(),
            is_disabled: self.is_disabled,
            polyphony: self.polyphony,
            is_drum_track: self.is_drum_track,
            commands: self.commands.split_at(time),
        }
    }
}

/// 255 is never used in vanilla songs so we can repurpose it to mean 'please calculate a good polyphonic_idx for me'
pub const POLYPHONIC_IDX_AUTO_MAMAR: u8 = 255;

#[derive(Debug, PartialEq, Eq, Hash, Clone, Copy, Serialize, Deserialize, TypeDef)]
pub enum Polyphony {
    Automatic,
    Manual { voices: u8 },
    Link { parent: u8 },
    Other { priority: u8 },
}

impl Polyphony {
    pub fn from_raw(raw_priority: u8, raw_parent_track_idx: u8) -> Self {
        if raw_parent_track_idx > 0 {
            return Self::Link {
                parent: raw_parent_track_idx - 1,
            };
        }

        match raw_priority {
            0 => Self::Manual { voices: 0 },
            1 => Self::Manual { voices: 1 },
            5 => Self::Manual { voices: 2 },
            6 => Self::Manual { voices: 3 },
            7 => Self::Manual { voices: 4 },
            POLYPHONIC_IDX_AUTO_MAMAR => Self::Automatic,
            _ => Self::Other { priority: raw_priority },
        }
    }

    pub fn to_polyphonic_idx(self) -> u8 {
        match self {
            Polyphony::Automatic => POLYPHONIC_IDX_AUTO_MAMAR,
            Polyphony::Manual { voices } => match voices {
                1 => 1,
                2 => 5,
                3 => 6,
                4 => 7,
                _ => 0,
            },
            Polyphony::Link { parent: _ } => 0,
            Polyphony::Other { priority } => priority,
        }
    }

    pub fn to_parent_idx(self) -> u8 {
        match self {
            Polyphony::Automatic | Polyphony::Manual { .. } | Polyphony::Other { .. } => 0,
            Polyphony::Link { parent } => parent + 1,
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
    pub rand_tune: u8,
    pub rand_volume: u8,
    pub rand_pan: u8,
    pub rand_reverb: u8,

    #[serde(skip_serializing_if = "is_default")]
    pub pad_0b: u8,
}

#[derive(Clone, Default, PartialEq, Eq, Debug, Serialize, Deserialize, TypeDef)]
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
