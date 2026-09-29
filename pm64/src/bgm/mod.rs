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

pub mod mix;
mod voices;
pub use voices::*;

use crate::id::{Id, gen_id};

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

    pub branches: BTreeMap<BranchId, Branch>,

    /// Beats in each bar, for editors to show bars with. The game doesn't use it. None means the editor's default.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub beats_per_bar: Option<u8>,

    /// What the song calls its [alternate parts](Track::alternate_for), such as "Oasis parts". The game doesn't use
    /// it. None means the editor's default.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alternate_parts_name: Option<String>,

    /// What the song calls each proximity mix its [branches](Command::Branch) choose between, such as "Near the
    /// station". The game doesn't use them.
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub mix_names: BTreeMap<u8, String>,
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

    pub fn find_branch_with_pos(&self, pos: FilePos) -> Option<BranchId> {
        self.branches
            .iter()
            .find(|(_, branch)| branch.pos == Some(pos))
            .map(|(id, _)| *id)
    }

    pub fn add_branch(&mut self, branch: Branch) -> BranchId {
        let id = self.branches.keys().next_back().map_or(1, |id| id + 1);
        self.branches.insert(id, branch);
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
                .map(|tl| tl.len_time(&self.branches))
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
        let matches: Vec<regex::Captures<'_>> = RON_COMMAND_REGEX.captures_iter(input_string).collect();
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
    /// Loops back to the [StartLoop](Segment::StartLoop) with the same `label_index` unless the game has set the
    /// conditional loop flag. The game never sets it, so this always loops.
    #[serde(alias = "Unknown6")]
    EndCondLoopFalse {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<Id>,
        label_index: u8,
        iter_count: u8,
    },
    /// Loops back to the [StartLoop](Segment::StartLoop) with the same `label_index` if the game has set the
    /// conditional loop flag. The game never sets it, so this never loops.
    #[serde(alias = "Unknown7")]
    EndCondLoopTrue {
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
            Segment::EndCondLoopFalse { id, .. } => *id = Some(gen_id()),
            Segment::EndCondLoopTrue { id, .. } => *id = Some(gen_id()),
        }
    }

    pub fn strip_id(&mut self) {
        match self {
            Segment::Subseg { id, .. } => *id = None,
            Segment::StartLoop { id, .. } => *id = None,
            Segment::Wait { id } => *id = None,
            Segment::EndLoop { id, .. } => *id = None,
            Segment::EndCondLoopFalse { id, .. } => *id = None,
            Segment::EndCondLoopTrue { id, .. } => *id = None,
        }
    }
}

mod segment_commands {
    pub const END: u32 = 0;
    pub const SUBSEG: u32 = 1 << 16;
    pub const START_LOOP: u32 = 3 << 16;
    pub const WAIT: u32 = 4 << 16;
    pub const END_LOOP: u32 = 5 << 16;
    pub const END_COND_LOOP_FALSE: u32 = 6 << 16;
    pub const END_COND_LOOP_TRUE: u32 = 7 << 16;
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
    /// The game ends a phrase when any enabled track reaches an [End](Command::End). Tracks without one play into
    /// whatever follows them, so the master track's length stands in when no track has one.
    pub fn len_time(&self, branches: &BTreeMap<BranchId, Branch>) -> usize {
        self.tracks
            .iter()
            .filter(|track| !track.is_disabled)
            .filter_map(|track| track.commands.end_time(branches))
            .min()
            .unwrap_or_else(|| self.tracks[0].commands.len_time())
    }

    /// Makes the phrase play for `time` ticks: every track that ends, and the master track, ends at `time`.
    pub fn set_len_time(&mut self, time: usize) {
        for (index, track) in self.tracks.iter_mut().enumerate() {
            let ends = track.commands.iter().any(|event| event.command == Command::End);
            if (index == 0 || ends) && !track.commands.is_empty() {
                track.commands = track.commands.with_end_at(time);
                track.pos = None;
            }
        }
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
    pub is_drum_track: bool,

    /// The polyphony index the track was stored with, encoded while the track is as decoded. Otherwise the encoder
    /// chooses its voices from its notes. See [TrackList::voices].
    #[serde(skip_serializing_if = "Option::is_none")]
    pub polyphonic_idx: Option<u8>,

    /// The index of the earlier track this one is an alternate part for. It plays in step with that track, using its
    /// voices, and the game plays one or the other: the alternate part when it sets linked mode on.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alternate_for: Option<u8>,

    pub commands: CommandSeq,

    /// Where the commands were decoded from, or None once they're edited. Decoded commands are encoded as they are,
    /// and tracks in a track list decoded from the same place share one copy of them. Other commands are compressed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pos: Option<FilePos>,
}

impl Default for Track {
    fn default() -> Self {
        Self {
            name: "".to_owned(),
            is_disabled: true,
            is_drum_track: false,
            polyphonic_idx: None,
            alternate_for: None,
            commands: Default::default(),
            pos: None,
        }
    }
}

impl Track {
    pub fn split_at(&mut self, time: usize) -> Track {
        let commands = self.commands.split_at(time);
        self.pos = None;
        Track {
            name: self.name.clone(),
            is_disabled: self.is_disabled,
            is_drum_track: self.is_drum_track,
            polyphonic_idx: None,
            alternate_for: self.alternate_for,
            commands,
            pos: None,
        }
    }
}

pub type BranchId = u64;

/// Passages a track can play at the same point, one of which the game picks by its proximity mix. See
/// [Command::Branch].
#[derive(Clone, Default, PartialEq, Eq, Debug, Serialize, Deserialize, TypeDef)]
#[serde(default)]
pub struct Branch {
    /// Encode/decode file position.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pos: Option<FilePos>,

    /// Indexed by proximity mix. The game plays the first option when the mix has no option.
    pub options: Vec<BranchOption>,
}

impl Branch {
    /// How long the first option plays. Options are expected to play for the same time.
    pub fn len_time(&self) -> usize {
        self.options.first().map_or(0, |option| option.commands.len_time())
    }
}

#[derive(Clone, Default, PartialEq, Eq, Debug, Serialize, Deserialize, TypeDef)]
#[serde(default)]
pub struct BranchOption {
    /// Sets whether the track plays drums, from this option onward.
    pub is_drum_track: bool,

    pub commands: CommandSeq,

    /// Where the commands were decoded from. Options decoded from the same place share one copy of their commands
    /// when encoded, as long as the commands are still equal.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pos: Option<FilePos>,
}

#[derive(Clone, Default, PartialEq, Eq, Debug, Serialize, Deserialize, TypeDef)]
#[serde(default)]
pub struct Drum {
    pub patch: PatchAddress,
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
    pub patch: PatchAddress,
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

fn is_default<T: Default + PartialEq>(t: &T) -> bool {
    t == &T::default()
}

#[derive(Clone, PartialEq, Eq, Hash, Debug, Default, Serialize, Deserialize, TypeDef)]
pub struct PatchAddress {
    /// Index of `AuGlobals::bankSets[...]` to use.
    pub bank_set: BankSetIndex,

    /// Index of InstrumentBank in the bank set.
    pub bank: u8,

    /// Index of Instrument in the bank.
    pub instrument: u8,

    /// Index of envelope preset in the instrument.
    /// If the instrument does not provide this envelope, a default is used.
    pub envelope: u8,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize, Deserialize, TypeDef)]
pub enum BankSetIndex {
    /// Extra banks loaded at request of BGM file
    Aux,
    Set2,
    /// Used only for au_reset_drum_entry/au_reset_instrument_entry
    Default,
    /// Where standard music instruments are stored
    Music,
    Set4,
    Set5,
    Set6,
    /// Same as Aux
    AuxCopy,
}

impl Default for BankSetIndex {
    fn default() -> Self {
        BankSetIndex::Default
    }
}

impl TryFrom<u8> for BankSetIndex {
    type Error = ();

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(BankSetIndex::Aux),
            1 => Ok(BankSetIndex::Set2),
            2 => Ok(BankSetIndex::Default),
            3 => Ok(BankSetIndex::Music),
            4 => Ok(BankSetIndex::Set4),
            5 => Ok(BankSetIndex::Set5),
            6 => Ok(BankSetIndex::Set6),
            7 => Ok(BankSetIndex::AuxCopy),
            _ => Err(()),
        }
    }
}

impl Into<u8> for BankSetIndex {
    fn into(self) -> u8 {
        match self {
            BankSetIndex::Aux => 0,
            BankSetIndex::Set2 => 1,
            BankSetIndex::Default => 2,
            BankSetIndex::Music => 3,
            BankSetIndex::Set4 => 4,
            BankSetIndex::Set5 => 5,
            BankSetIndex::Set6 => 6,
            BankSetIndex::AuxCopy => 7,
        }
    }
}
