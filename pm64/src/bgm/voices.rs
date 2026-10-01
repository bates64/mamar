//! Choosing how many voices each track of a phrase gets.
//!
//! The game plays music on 24 voices, and gives each track of a phrase 0 to 4 of them, one track after another. A
//! track that starts a note with none free takes one from its own notes, cutting it off.

use std::collections::BTreeMap;

use serde_derive::{Deserialize, Serialize};
use typescript_type_def::TypeDef;

use super::{Branch, BranchId, Command, CommandSeq, TrackList};
use crate::id::Id;

/// Voices the game has for a phrase's tracks. Beyond this, the game reads past the end of its voices.
pub const MAX_VOICES: usize = 24;

/// Most voices a track can have.
pub const MAX_TRACK_VOICES: u8 = 4;

/// Voices each track of a phrase needs and gets.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TypeDef)]
pub struct Voices {
    /// Most notes each track plays at once, up to [MAX_TRACK_VOICES]. Alternate parts count toward the track they're
    /// for, as they use its voices, and need none of their own.
    pub needed: [u8; 16],
    /// Voices each track gets. Some tracks get fewer than they need when the phrase needs more than [MAX_VOICES].
    pub given: [u8; 16],
}

impl Voices {
    pub fn total_needed(&self) -> usize {
        self.needed.iter().map(|&voices| voices as usize).sum()
    }

    pub fn total_given(&self) -> usize {
        self.given.iter().map(|&voices| voices as usize).sum()
    }
}

/// The polyphony index the game uses for `voices` voices.
pub fn polyphonic_idx(voices: u8) -> u8 {
    match voices {
        0 => 0,
        1 => 1,
        2 => 5,
        3 => 6,
        _ => 7,
    }
}

/// The voices the game gives a track with polyphony index `idx`.
pub fn voices_of_polyphonic_idx(idx: u8) -> u8 {
    match idx {
        1 => 1,
        5 => 2,
        6 => 3,
        7 => 4,
        _ => 0,
    }
}

/// Most of `spans` that hold a voice at once. A note's voice is free again at the tick it ends.
fn most_at_once(spans: &[(usize, usize)]) -> usize {
    let mut changes: Vec<(usize, i32)> = spans.iter().flat_map(|&(start, end)| [(start, 1), (end, -1)]).collect();
    // A voice freed at a tick can be used by a note starting at that tick
    changes.sort_by_key(|&(time, change)| (time, change));
    let mut held = 0;
    let mut most = 0;
    for (_, change) in changes {
        held += change;
        most = most.max(held);
    }
    most as usize
}

/// How many of `spans` start with all of `voices` voices held, and so cut off another note.
fn notes_cut(spans: &[(usize, usize)], voices: u8) -> usize {
    let mut starts: Vec<&(usize, usize)> = spans.iter().collect();
    starts.sort();
    let mut playing: Vec<usize> = Vec::new();
    let mut cut = 0;
    for &&(start, end) in &starts {
        playing.retain(|&playing_end| playing_end > start);
        if playing.len() >= voices as usize {
            cut += 1;
            // The note that would finish soonest is cut off, as the game does
            if let Some(soonest) = playing.iter().enumerate().min_by_key(|&(_, end)| *end).map(|(i, _)| i) {
                playing.remove(soonest);
            }
        }
        if voices > 0 {
            playing.push(end);
        }
    }
    cut
}

/// Longest overlap, in ticks, of one note into the next that's taken to be a mistake, such as a DAW leaves between
/// notes meant to follow each other. A note held into the next for longer is taken to be meant.
pub const SHORT_OVERLAP: usize = 6;

/// Where a track of a phrase plays the most notes at once, and the short overlaps that may add to them.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TypeDef)]
pub struct VoiceUse {
    /// When the track first plays the most notes it plays at once, in ticks from the start of the phrase.
    pub busiest_at: Option<usize>,
    /// The notes playing whenever the track plays the most notes it plays at once.
    pub busiest_notes: Vec<Id>,
    /// Notes held at most [SHORT_OVERLAP] ticks into a note that starts after them, which
    /// [CommandSeq::trim_short_overlaps] shortens.
    pub short_overlaps: Vec<Id>,
}

/// The voices each track of a phrase needs and gets, and where each needs them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TypeDef)]
pub struct VoiceReport {
    pub voices: Voices,
    pub tracks: [VoiceUse; 16],
}

/// The notes of `notes`, as (start, end, ID), playing whenever the most of them play at once, and when that first is.
fn busiest(notes: &[(usize, usize, Id)]) -> (Option<usize>, Vec<Id>) {
    let most = most_at_once(&notes.iter().map(|&(start, end, _)| (start, end)).collect::<Vec<_>>());
    if most == 0 {
        return (None, Vec::new());
    }
    let mut starts: Vec<usize> = notes.iter().map(|&(start, ..)| start).collect();
    starts.sort_unstable();
    starts.dedup();

    let mut first = None;
    let mut ids = Vec::new();
    for time in starts {
        let playing: Vec<Id> = notes
            .iter()
            .filter(|&&(start, end, _)| start <= time && time < end)
            .map(|&(.., id)| id)
            .collect();
        if playing.len() == most {
            first.get_or_insert(time);
            for id in playing {
                if !ids.contains(&id) {
                    ids.push(id);
                }
            }
        }
    }
    (first, ids)
}

/// For each note of `notes`, as (start, end, ID), held at most [SHORT_OVERLAP] ticks into a note that starts after it,
/// the note's ID and the length that ends it where the soonest such note starts.
pub fn short_overlaps(notes: &[(usize, usize, Id)]) -> Vec<(Id, usize)> {
    notes
        .iter()
        .filter_map(|&(start, end, id)| {
            notes
                .iter()
                .filter(|&&(next, ..)| next > start && next < end && end - next <= SHORT_OVERLAP)
                .map(|&(next, ..)| next)
                .min()
                .map(|next| (id, next - start))
        })
        .collect()
}

/// The notes `commands` plays itself, not those of its branches, as (start, end, ID).
pub(super) fn own_notes(commands: &CommandSeq, branches: &BTreeMap<BranchId, Branch>) -> Vec<(usize, usize, Id)> {
    commands
        .playback(branches)
        .into_iter()
        .filter_map(|(time, event)| match event.command {
            Command::Note { length, .. } => Some((time, time + length as usize, event.id)),
            _ => None,
        })
        .collect()
}

impl TrackList {
    /// The voices each track needs and gets, and where each track, as proximity mix `mix` plays it, needs them. Short
    /// overlaps are found among a track's own notes, not its branches'.
    pub fn voice_report(&self, branches: &BTreeMap<BranchId, Branch>, mix: usize) -> VoiceReport {
        let tracks = std::array::from_fn(|index| {
            let track = &self.tracks[index];
            if track.is_disabled {
                return VoiceUse::default();
            }
            // As the editor shows the mix, with the IDs it gives the notes of branches
            let played = own_notes(&track.commands.for_mix(branches, mix), branches);
            let (busiest_at, busiest_notes) = busiest(&played);
            VoiceUse {
                busiest_at,
                busiest_notes,
                short_overlaps: short_overlaps(&own_notes(&track.commands, branches))
                    .into_iter()
                    .map(|(id, _)| id)
                    .collect(),
            }
        });
        VoiceReport {
            voices: self.voices(branches),
            tracks,
        }
    }

    /// When each track holds voices, for each proximity mix its branches choose between.
    fn spans_by_mix(&self, branches: &BTreeMap<BranchId, Branch>) -> Vec<[Vec<(usize, usize)>; 16]> {
        let mixes = branches
            .values()
            .map(|branch| branch.options.len())
            .max()
            .unwrap_or(1)
            .max(1);
        (0..mixes)
            .map(|mix| {
                std::array::from_fn(|index| {
                    let track = &self.tracks[index];
                    if track.is_disabled {
                        Vec::new()
                    } else {
                        track.commands.note_spans(branches, mix)
                    }
                })
            })
            .collect()
    }

    /// Voices each track needs, and gets. Tracks as decoded keep the voices they were stored with, to encode as they
    /// were. If the phrase needs more than [MAX_VOICES], voices are taken, one at a time, from the track that cuts off
    /// the fewest more notes without it.
    pub fn voices(&self, branches: &BTreeMap<BranchId, Branch>) -> Voices {
        let spans = self.spans_by_mix(branches);
        let need_of = |index: usize| {
            spans
                .iter()
                .map(|by_track| most_at_once(&by_track[index]))
                .max()
                .unwrap_or(0)
                .min(MAX_TRACK_VOICES as usize) as u8
        };

        let mut needed = [0u8; 16];
        for (index, track) in self.tracks.iter().enumerate() {
            if track.alternate_for.is_some() {
                continue;
            }
            let alternates = self
                .tracks
                .iter()
                .enumerate()
                .filter(|(_, other)| other.alternate_for == Some(index as u8))
                .map(|(alternate, _)| need_of(alternate));
            needed[index] = alternates.fold(need_of(index), u8::max);
        }

        let is_fixed = |index: usize| {
            let track = &self.tracks[index];
            track.pos.is_some() && track.polyphonic_idx.is_some() && track.alternate_for.is_none()
        };
        let mut given = needed;
        for (index, track) in self.tracks.iter().enumerate() {
            if is_fixed(index) {
                given[index] = voices_of_polyphonic_idx(track.polyphonic_idx.unwrap());
            }
        }

        // Cuts the notes of a track and its alternate parts would make with `voices` voices, in its worst mix
        let cuts = |index: usize, voices: u8| {
            let versions: Vec<usize> = std::iter::once(index)
                .chain((0..16).filter(|&other| self.tracks[other].alternate_for == Some(index as u8)))
                .collect();
            spans
                .iter()
                .flat_map(|by_track| {
                    versions
                        .iter()
                        .map(move |&version| notes_cut(&by_track[version], voices))
                })
                .max()
                .unwrap_or(0)
        };
        while given.iter().map(|&voices| voices as usize).sum::<usize>() > MAX_VOICES {
            let cheapest = (0..16)
                .filter(|&index| !is_fixed(index) && given[index] > 0)
                .min_by_key(|&index| cuts(index, given[index] - 1) - cuts(index, given[index]));
            match cheapest {
                Some(index) => given[index] -= 1,
                None => break,
            }
        }

        Voices { needed, given }
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn most_at_once_frees_voices_as_notes_end() {
        assert_eq!(most_at_once(&[]), 0);
        assert_eq!(most_at_once(&[(0, 10), (10, 20)]), 1);
        assert_eq!(most_at_once(&[(0, 10), (5, 20), (6, 7)]), 3);
    }

    #[test]
    fn phrases_over_budget_lose_the_voices_they_miss_least() {
        use crate::bgm::{Command, CommandSeq, Track};

        let chord = |notes: usize, length: u16| {
            let mut seq = CommandSeq::from(
                (0..notes)
                    .map(|i| Command::Note {
                        pitch: 60 + i as u8,
                        velocity: 100,
                        length,
                    })
                    .collect::<Vec<_>>(),
            );
            seq.push(Command::Delay(96));
            seq.push(Command::End);
            seq
        };
        let mut track_list = TrackList::default();
        // Seven tracks of four-note chords need 28 voices. The last track's chord is shortest, but every note of a
        // chord starts at once, so each track loses the same by giving up a voice.
        for (index, track) in track_list.tracks.iter_mut().enumerate().skip(1).take(7) {
            *track = Track {
                is_disabled: false,
                commands: chord(4, if index == 7 { 1 } else { 96 }),
                ..Track::default()
            };
        }

        let voices = track_list.voices(&BTreeMap::new());
        assert_eq!(voices.total_needed(), 28);
        assert_eq!(voices.total_given(), MAX_VOICES);
    }

    #[test]
    fn busiest_notes_are_those_playing_at_the_peak() {
        // Two notes in a row overlap slightly, and the third plays alone
        let notes = [(0, 50, 1), (48, 96, 2), (100, 140, 3)];
        assert_eq!(busiest(&notes), (Some(48), vec![1, 2]));
        assert_eq!(busiest(&[]), (None, vec![]));
    }

    #[test]
    fn short_overlaps_leave_chords_and_long_overlaps() {
        let notes = [
            (0, 50, 1),   // 2 ticks into the next
            (48, 96, 2),  // 6 ticks into the next, the most that's short
            (90, 150, 3), // 30 ticks into the next, so meant
            (120, 200, 4),
            (120, 200, 5), // A chord with the one before
        ];
        assert_eq!(short_overlaps(&notes), vec![(1, 48), (2, 42)]);
    }

    #[test]
    fn trimming_short_overlaps_frees_a_voice() {
        use crate::bgm::{Command, CommandSeq, Track};

        let note = |length| Command::Note {
            pitch: 60,
            velocity: 100,
            length,
        };
        // Each note is held 2 ticks into the next
        let mut commands = CommandSeq::from(vec![note(50)]);
        commands.push(Command::Delay(48));
        commands.push(note(50));
        commands.push(Command::Delay(48));
        commands.push(note(48));
        commands.push(Command::Delay(48));
        commands.push(Command::End);

        let mut track_list = TrackList::default();
        track_list.tracks[1] = Track {
            is_disabled: false,
            commands,
            ..Track::default()
        };
        let report = track_list.voice_report(&BTreeMap::new(), 0);
        assert_eq!(report.voices.needed[1], 2);
        assert_eq!(report.tracks[1].short_overlaps.len(), 2);
        assert_eq!(report.tracks[1].busiest_at, Some(48));

        assert_eq!(track_list.tracks[1].commands.trim_short_overlaps(&BTreeMap::new()), 2);
        let report = track_list.voice_report(&BTreeMap::new(), 0);
        assert_eq!(report.voices.needed[1], 1);
        assert!(report.tracks[1].short_overlaps.is_empty());
    }

    #[test]
    fn notes_cut_counts_notes_without_a_free_voice() {
        let spans = [(0, 10), (5, 20), (6, 7)];
        assert_eq!(notes_cut(&spans, 3), 0);
        assert_eq!(notes_cut(&spans, 2), 1);
        assert_eq!(notes_cut(&spans, 1), 2);
    }
}
