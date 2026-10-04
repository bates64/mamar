//! Reimporting a MIDI file into a song made from an earlier version of it, keeping what was changed in Mamar.
//!
//! The song keeps an [ImportLink] saying which MIDI file and tracks it came from. While it's open, the editor also
//! holds the last import as a [Timeline]: one list of timed commands per source track. On save, the link stores a
//! [Patch] of what Mamar changed since the last import, and on open the last import is rebuilt by undoing the patch.
//! A reimport is a three-way merge of the last import, the song, and the new import.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::error::Error;

use serde_derive::{Deserialize, Serialize};
use typescript_type_def::TypeDef;

use super::*;

#[cfg(feature = "midly")]
mod merge;
#[cfg(feature = "midly")]
pub use merge::{Imported, import, reimport};

/// Names a source track: "master" for the master track, the MIDI track's name if no other track in the file has it,
/// `ch1` to `ch16` for the channels of a single-track file, or else `#` and its position, such as `#3`. A MIDI track
/// that plays on several channels is split into a track for each: the channel it plays the most notes on has its key,
/// and the others have the key and the channel, such as `#3/ch2`.
pub type TrackKey = String;

/// The MIDI file a song was imported from, and what Mamar has changed since.
#[derive(Clone, Default, Debug, PartialEq, Eq, Serialize, Deserialize, TypeDef)]
#[serde(default)]
pub struct ImportLink {
    /// Chosen on the first import and kept across reimports, so the editor can remember the file.
    pub id: u32,
    /// The file's name, for messages.
    pub source_name: String,
    /// Hash of the file. Reimporting a file with the same hash changes nothing.
    pub source_hash: u32,
    /// The source track each of the song's 16 tracks came from. None for tracks made in Mamar.
    pub track_keys: Vec<Option<TrackKey>>,
    /// Hash of the last import's [Timeline], to check that it was rebuilt correctly.
    pub base_hash: u32,
    /// What Mamar changed since the last import. Only up to date as saved.
    pub patch: Patch,
}

/// The commands Mamar added to and removed from each source track since the last import.
#[derive(Clone, Default, Debug, PartialEq, Eq, Serialize, Deserialize, TypeDef)]
#[serde(default)]
pub struct Patch {
    pub tracks: Vec<TrackPatch>,
}

#[derive(Clone, Default, Debug, PartialEq, Eq, Serialize, Deserialize, TypeDef)]
#[serde(default)]
pub struct TrackPatch {
    pub key: TrackKey,
    /// Commands in the last import that Mamar removed, in full, so the import can be rebuilt.
    pub removed: Vec<Timed>,
    /// Commands Mamar added. A changed command is one removal plus one addition.
    pub added: Vec<Timed>,
}

/// A command at a time along variation 0, in ticks from its start.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, TypeDef)]
pub struct Timed {
    pub tick: u32,
    pub command: Command,
}

/// Each source track's commands, in the order they play. Sections played more than once appear each time.
pub type Timeline = BTreeMap<TrackKey, Vec<Timed>>;

/// What a reimport did, for the editor to show.
#[derive(Clone, Default, Debug, PartialEq, Eq, Serialize, Deserialize, TypeDef)]
#[serde(default)]
pub struct Report {
    /// The file is the one last imported, so nothing changed.
    pub unchanged: bool,
    /// What Mamar couldn't keep.
    pub problems: Vec<String>,
}

/// The song's link, with its patch set to what was changed since the last import, `base`. Call it before saving.
pub fn with_patch(bgm: &Bgm, base: &Timeline) -> Option<ImportLink> {
    let mut link = bgm.import.clone()?;
    let ours = timeline(bgm, &link.track_keys).ok()?;
    link.patch = Patch {
        tracks: ours
            .keys()
            .chain(base.keys())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .filter_map(|key| {
                let empty = Vec::new();
                let ours = ours.get(key).unwrap_or(&empty);
                let base = base.get(key).unwrap_or(&empty);
                let patch = TrackPatch {
                    key: key.clone(),
                    removed: difference(base, ours),
                    added: difference(ours, base),
                };
                (!patch.removed.is_empty() || !patch.added.is_empty()).then_some(patch)
            })
            .collect(),
    };
    Some(link)
}

/// Rebuilds the last import from an opened song by undoing its patch, or None if it doesn't match the hash it was
/// saved with, such as when the song was opened without the sound bank that its recording switches are taken out with.
pub fn rebuild_base(bgm: &Bgm) -> Option<Timeline> {
    let link = bgm.import.as_ref()?;
    let mut base = timeline(bgm, &link.track_keys).ok()?;
    for patch in &link.patch.tracks {
        let track = base.entry(patch.key.clone()).or_default();
        for added in &patch.added {
            let index = track.iter().position(|timed| timed == added)?;
            track.remove(index);
        }
        track.extend(patch.removed.iter().cloned());
        track.sort_by_key(|timed| timed.tick);
    }
    base.retain(|_, track| !track.is_empty());
    (hash(&canonical(&base)) == link.base_hash).then_some(base)
}

/// Commands that never come from a MIDI file, so they aren't part of an import: Mamar keeps them where they are.
fn is_mamar_only(command: &Command) -> bool {
    matches!(command, Command::Branch { .. })
}

/// One play of a section of variation 0.
#[derive(Clone, Copy, Debug)]
struct Span {
    track_list: TrackListId,
    start: usize,
    len: usize,
}

fn spans(bgm: &Bgm) -> Result<Vec<Span>, Box<dyn Error>> {
    let variation = bgm.variations[0]
        .as_ref()
        .ok_or("The song's first variation has been removed.")?;
    let mut spans = Vec::new();
    let mut start = 0;
    for segment in &variation.segments {
        if let Segment::Subseg { track_list, .. } = segment {
            let len = bgm
                .track_lists
                .get(track_list)
                .map_or(0, |track_list| track_list.len_time(&bgm.branches));
            spans.push(Span {
                track_list: *track_list,
                start,
                len,
            });
            start += len;
        }
    }
    Ok(spans)
}

/// Each of a track's commands along variation 0, with detours written out, leaving out timing and markers.
fn track_timeline(bgm: &Bgm, spans: &[Span], index: usize) -> Vec<Timed> {
    let mut timeline = Vec::new();
    for span in spans {
        let Some(track) = bgm.track_lists.get(&span.track_list).map(|tl| &tl.tracks[index]) else {
            continue;
        };
        for (time, event) in track.commands.without_detours().iter_time() {
            match event.command {
                Command::End => break,
                Command::Delay(_) | Command::Marker { .. } | Command::Detour { .. } => {}
                _ if time >= span.len => {}
                _ => timeline.push(Timed {
                    tick: (span.start + time) as u32,
                    command: event.command.clone(),
                }),
            }
        }
    }
    timeline
}

/// The song's source tracks as a [Timeline], leaving out [Mamar-only](is_mamar_only) commands.
pub fn timeline(bgm: &Bgm, track_keys: &[Option<TrackKey>]) -> Result<Timeline, Box<dyn Error>> {
    let spans = spans(bgm)?;
    let mut timeline = Timeline::new();
    for (index, key) in track_keys.iter().enumerate().take(16) {
        if let Some(key) = key {
            let track: Vec<Timed> = track_timeline(bgm, &spans, index)
                .into_iter()
                .filter(|timed| !is_mamar_only(&timed.command))
                .collect();
            if !track.is_empty() {
                timeline.insert(key.clone(), track);
            }
        }
    }
    Ok(timeline)
}

/// The commands in `a` that aren't in `b`, counting repeats.
fn difference(a: &[Timed], b: &[Timed]) -> Vec<Timed> {
    let mut counts: HashMap<&Timed, usize> = HashMap::new();
    for timed in b {
        *counts.entry(timed).or_default() += 1;
    }
    a.iter()
        .filter(|timed| match counts.get_mut(timed) {
            Some(count) if *count > 0 => {
                *count -= 1;
                false
            }
            _ => true,
        })
        .cloned()
        .collect()
}

/// The timeline as bytes that don't depend on the order of commands at the same tick, for hashing.
fn canonical(timeline: &Timeline) -> Vec<u8> {
    let sorted: BTreeMap<&TrackKey, Vec<(u32, Vec<u8>)>> = timeline
        .iter()
        .map(|(key, track)| {
            let mut track: Vec<(u32, Vec<u8>)> = track
                .iter()
                .map(|timed| (timed.tick, rmp_serde::to_vec(&timed.command).unwrap_or_default()))
                .collect();
            track.sort();
            (key, track)
        })
        .collect();
    rmp_serde::to_vec(&sorted).unwrap_or_default()
}

/// 32-bit FNV-1a, which fits in a JavaScript number.
fn hash(bytes: &[u8]) -> u32 {
    bytes.iter().fold(0x811C_9DC5, |hash, byte| {
        (hash ^ *byte as u32).wrapping_mul(0x0100_0193)
    })
}

/// Encodes a [Timeline] to keep in the editor while the song is open.
pub fn encode_timeline(timeline: &Timeline) -> Vec<u8> {
    rmp_serde::to_vec(timeline).unwrap_or_default()
}

pub fn decode_timeline(bytes: &[u8]) -> Option<Timeline> {
    rmp_serde::from_slice(bytes).ok()
}
