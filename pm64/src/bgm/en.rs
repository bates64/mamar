use std::collections::HashMap;
use std::fmt;
use std::io::prelude::*;
use std::io::{self, SeekFrom};

use log::{debug, warn};

use super::*;
use crate::rw::*;

#[derive(Debug)]
pub enum Error {
    MissingStartMarker(MarkerId),
    MissingEndMarker(MarkerId),
    UnorderedMarkers(MarkerId),
    EndMarkerTooFarAway(MarkerId),
    MissingBranch(BranchId),
    TooBig,
    Io(io::Error),
}

impl From<io::Error> for Error {
    fn from(io: io::Error) -> Self {
        Self::Io(io)
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Error::MissingStartMarker(id) => write!(f, "Cannot find start marker {:?}", id),
            Error::MissingEndMarker(id) => write!(f, "Cannot find end marker {:?}", id),
            Error::UnorderedMarkers(id) => {
                write!(f, "Start marker comes after end marker {:?}", id)
            }
            Error::EndMarkerTooFarAway(id) => write!(f, "End marker '{:?}' is too far away from start marker", id,),
            Error::MissingBranch(id) => write!(f, "Cannot find branch {}", id),
            Error::TooBig => write!(f, "Encoded BGM data is too large for game engine to handle"),
            Error::Io(source) => write!(f, "{}", source),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Error::Io(source) => Some(source),
            _ => None,
        }
    }
}

impl Bgm {
    pub fn as_bytes(&self) -> Result<Vec<u8>, Error> {
        let mut encoded = io::Cursor::new(Vec::new());
        self.encode(&mut encoded)?;
        Ok(encoded.into_inner())
    }

    pub fn encode<W: Write + Seek>(&self, f: &mut W) -> Result<(), Error> {
        let mut metadata = mamar::Metadata::default();
        metadata.set_beats_per_bar(self.beats_per_bar);
        metadata.set_names(self.alternate_parts_name.clone(), self.mix_names.clone());

        f.seek(SeekFrom::Start(0))?;

        f.write_all(MAGIC.as_bytes())?;

        debug_assert_eq!(f.pos()?, 0x04);
        let file_size_offset = {
            let pos = SeekFrom::Start(f.pos()?);
            f.write_u32_be(0)?;
            pos
        };

        debug_assert_eq!(f.pos()?, 0x08);
        f.write_all(self.name.as_bytes())?;
        f.seek(SeekFrom::Start(0x0C))?;

        f.write_all(&[0, 0, 0, 0, self.variations.len() as u8, 0, 0, 0])?;

        debug_assert_eq!(f.pos()?, 0x14);
        let segment_offsets = (0..self.variations.len())
            .map(|_| {
                let pos = f.pos()?;
                f.write_u16_be(0)?;
                Ok(pos)
            })
            .collect::<Result<Vec<_>, Error>>()?;
        let drums_offset = {
            let pos = SeekFrom::Start(f.pos()?);
            f.write_u16_be(0)?;
            pos
        };
        f.write_u16_be(self.drums.len() as u16)?;
        let voices_offset = {
            let pos = SeekFrom::Start(f.pos()?);
            f.write_u16_be(0)?;
            pos
        };
        f.write_u16_be(self.instruments.len() as u16)?;

        debug_assert_eq!(f.pos()?, 0x24); // End of header struct

        // Write drums
        if !self.drums.is_empty() {
            f.align(4)?;
            let pos = (f.pos()? >> 2) as u16;
            f.write_u16_be_at(pos, drums_offset)?;
            for drum in self.drums.iter() {
                drum.encode(f)?;
            }
        }

        // Write instruments
        if !self.instruments.is_empty() {
            f.align(4)?;
            let pos = (f.pos()? >> 2) as u16;
            f.write_u16_be_at(pos, voices_offset)?;
            for voice in self.instruments.iter() {
                voice.encode(f)?;
            }
        }

        /*
        subseg0
        subseg1
        tracks        [for subseg0]
        sequences
        tracks        [for subseg1]
        sequences
        ...
        sequences     [of tracks that branch]
        branch tables
        branch options
        */

        // Where each track list's offset needs writing, and what it is relative to
        let mut track_list_refs: HashMap<TrackListId, Vec<(u64, u64)>> = HashMap::new();

        // Write segments
        for (offset, segment) in segment_offsets.into_iter().zip(self.variations.iter()) {
            if let Some(segment) = segment {
                f.align(4)?;
                debug!("segment {:#X}", f.pos()?);
                // Write offset in header
                let pos = (f.pos()? >> 2) as u16;
                f.write_u16_be_at(pos, SeekFrom::Start(offset))?;

                // Write segment header
                let segment_start = f.pos()?;

                for subsegment in &segment.segments {
                    debug!("subsegment {:#X}", f.pos()?);
                    if let Some((tracks_pos, track_list_id)) = subsegment.encode(f)? {
                        // Need to write track data after the header
                        track_list_refs
                            .entry(track_list_id)
                            .or_default()
                            .push((tracks_pos, segment_start));
                    }
                }
                f.write_all(&[0, 0, 0, 0])?; // Terminator
            } else {
                // Offset in header is already 0 (null)
            }
        }

        // Write track lists, including those no segment plays
        let mut track_list_ids: Vec<&TrackListId> = self.track_lists.keys().collect();
        track_list_ids.sort_by_key(|id| (self.track_lists[id].pos.unwrap_or(u64::MAX), **id));

        let mut branch_refs = Vec::new();
        let mut branching_tracks = Vec::new();

        for (track_list_no, track_list_id) in track_list_ids.into_iter().enumerate() {
            let track_list = &self.track_lists[track_list_id];

            f.align(4)?; // This position needs to be right-shifted by 2 without loss

            // For matching, write the track list where it was decoded from, unless that would overwrite something
            let track_data_start = match track_list.pos {
                Some(pos) if pos >= f.pos()? => {
                    f.seek(SeekFrom::Start(pos))?;
                    pos
                }
                _ => f.pos()?,
            };

            debug!("tracks start = {:#X}", track_data_start);

            // Write offset in segment headers
            for (tracks_pos, segment_start) in track_list_refs.remove(track_list_id).unwrap_or_default() {
                let pos = ((track_data_start - segment_start) >> 2) as u16;
                f.write_u16_be_at(pos, SeekFrom::Start(tracks_pos))?;
            }

            // Write flags
            let voices = track_list.voices(&self.branches);
            let mut todo_commands = Vec::new();
            for (track_no, track) in track_list.tracks.iter().enumerate() {
                let Track {
                    name,
                    is_disabled,
                    is_drum_track,
                    commands,
                    ..
                } = track;

                if track_no != 0 {
                    metadata.add_track_name(track_list_no as u16 + 1, name.clone());
                }

                if !commands.is_empty() {
                    // Need to write command data after the track list. Tracks that branch go after every track list.
                    if commands
                        .iter()
                        .any(|event| matches!(event.command, Command::Branch { .. }))
                    {
                        branching_tracks.push((f.pos()?, track_data_start, track));
                    } else {
                        todo_commands.push((f.pos()?, track_data_start, track));
                    }
                }
                f.write_u16_be(0)?; // Replaced later if !null

                // Tracks as decoded keep their polyphony, and alternate parts use the voices of the track they're for
                let polyphonic_idx = match (track.pos, track.polyphonic_idx) {
                    (Some(_), Some(idx)) => idx,
                    _ => super::polyphonic_idx(
                        voices.given[track.alternate_for.map_or(track_no, |index| index as usize)],
                    ),
                };

                let flags = (*is_disabled as u16) << 8
                    | (polyphonic_idx as u16) << 0xD
                    | if *is_drum_track { 0x0080 } else { 0 }
                    | (track.alternate_for.map_or(0, |index| index + 1) as u16 & 0xF) << 9;
                f.write_u16_be(flags)?;
            }

            encode_tracks(f, todo_commands, &mut branch_refs)?;
        }

        encode_tracks(f, branching_tracks, &mut branch_refs)?;

        // Write branch tables
        let mut branch_ids: Vec<&BranchId> = self.branches.keys().collect();
        branch_ids.sort_by_key(|id| (self.branches[id].pos.unwrap_or(u64::MAX), **id));

        let mut table_positions = HashMap::new();
        for &branch_id in &branch_ids {
            table_positions.insert(branch_id, f.pos()?);
            for option in &self.branches[branch_id].options {
                f.write_u16_be(0)?; // Replaced later
                f.write_u8(option.is_drum_track as u8)?;
            }
        }

        // Write branch options, every table's first option before any second option
        let mut encoded_options: Vec<(&BranchOption, u64)> = Vec::new();
        let max_options = self
            .branches
            .values()
            .map(|branch| branch.options.len())
            .max()
            .unwrap_or(0);
        for option_no in 0..max_options {
            for &branch_id in &branch_ids {
                let Some(option) = self.branches[branch_id].options.get(option_no) else {
                    continue;
                };

                let shared = encoded_options.iter().find(|(encoded, _)| {
                    encoded.pos.is_some() && encoded.pos == option.pos && encoded.commands.commands_eq(&option.commands)
                });
                let commands_pos = match shared {
                    Some((_, pos)) => *pos,
                    None => {
                        let pos = f.pos()?;
                        option.commands.encode(f, &mut branch_refs)?;
                        encoded_options.push((option, pos));
                        pos
                    }
                };

                let entry_pos = table_positions[branch_id] + option_no as u64 * 3;
                f.write_u16_be_at(commands_pos as u16, SeekFrom::Start(entry_pos))?;
            }
        }

        // Point branch commands at their tables
        for (pos, branch_id) in branch_refs {
            let table_pos = *table_positions.get(&branch_id).ok_or(Error::MissingBranch(branch_id))?;
            let option_count = self.branches[&branch_id].options.len() as u8;
            f.write_u16_be_at(table_pos as u16, SeekFrom::Start(pos))?;
            let end = f.pos()?;
            f.seek(SeekFrom::Start(pos + 2))?;
            f.write_u8(option_count)?;
            f.seek(SeekFrom::Start(end))?;
        }

        // Write file size
        let file_size = f.pos()? as u32;
        f.write_u32_be_at(file_size, file_size_offset)?;

        debug!("end = {:#X}", f.pos()?);

        // Write Mamar-specific information. But don't bother if its empty (needed for matching)
        if metadata.has_data() {
            f.align(8)?;
            f.write_cstring_lossy(mamar::MAGIC, mamar::MAGIC_MAX_LEN)?;
            if let Ok(metadata) = rmp_serde::to_vec(&metadata) {
                f.write_all(&metadata)?;
            } else {
                warn!("failed to encode Mamar metadata");
            }
        }

        if f.pos()? <= 0x8A8F {
            Ok(())
        } else {
            Err(Error::TooBig) // TODO: make into warning and surface to caller somehow
        }
    }
}

/// Writes the commands of each `(offset field position, track list start, track)` and points the offset field at them.
/// Tracks in the same track list that were decoded from the same place share one copy, as long as their commands are
/// still equal. Tracks that weren't decoded, or were edited since, are compressed into detours.
fn encode_tracks<W: Write + Seek>(
    f: &mut W,
    tracks: Vec<(u64, u64, &Track)>,
    branch_refs: &mut Vec<(u64, BranchId)>,
) -> Result<(), Error> {
    let mut encoded: Vec<(u64, &Track, u64)> = Vec::new();
    for (offset_pos, track_list_start, track) in tracks {
        let shared = encoded.iter().find(|(start, encoded, _)| {
            *start == track_list_start
                && encoded.pos.is_some()
                && encoded.pos == track.pos
                && encoded.commands.commands_eq(&track.commands)
        });
        let commands_pos = match shared {
            Some((_, _, pos)) => *pos,
            None => {
                let pos = f.pos()?;
                match track.pos {
                    Some(_) => track.commands.encode(f, branch_refs)?,
                    None => track.commands.with_detours().encode(f, branch_refs)?,
                }
                encoded.push((track_list_start, track, pos));
                pos
            }
        };
        f.write_u16_be_at((commands_pos - track_list_start) as u16, SeekFrom::Start(offset_pos))?;
    }
    Ok(())
}

impl Drum {
    pub fn encode<W: Write + Seek>(&self, f: &mut W) -> Result<(), Error> {
        self.patch.encode(f)?;
        f.write_u8(self.coarse_tune)?;
        f.write_u8(self.fine_tune)?;
        f.write_u8(self.volume)?;
        f.write_i8(self.pan)?;
        f.write_u8(self.reverb)?;
        f.write_u8(self.rand_tune)?;
        f.write_u8(self.rand_volume)?;
        f.write_u8(self.rand_pan)?;
        f.write_u8(self.rand_reverb)?;
        f.write_u8(self.pad_0b)?;
        Ok(())
    }
}

impl Instrument {
    pub fn encode<W: Write + Seek>(&self, f: &mut W) -> Result<(), Error> {
        self.patch.encode(f)?;
        f.write_u8(self.volume)?;
        f.write_i8(self.pan)?;
        f.write_u8(self.reverb)?;
        f.write_u8(self.coarse_tune)?;
        f.write_u8(self.fine_tune)?;
        f.write_u8(self.pad_07)?;
        Ok(())
    }
}

impl PatchAddress {
    pub fn encode<W: Write + Seek>(&self, f: &mut W) -> Result<(), Error> {
        let bank_set: u8 = self.bank_set.into();
        f.write_u8(bank_set << 4 | self.envelope)?;
        f.write_u8(self.bank << 4 | self.instrument)?;
        Ok(())
    }
}

impl Segment {
    pub fn encode<W: Write + Seek>(&self, f: &'_ mut W) -> Result<Option<(u64, TrackListId)>, Error> {
        match self {
            Segment::Subseg { track_list, .. } => {
                f.write_u16_be((segment_commands::SUBSEG >> 4) as u16)?;
                let tracks_pos = f.pos()?;
                f.write_u16_be(0)?;

                Ok(Some((tracks_pos, *track_list)))
            }
            Segment::Wait { .. } => {
                f.write_u16_be((segment_commands::WAIT >> 4) as u16)?;
                f.write_u16_be(0)?;
                Ok(None)
            }
            Segment::StartLoop { label_index, .. } => {
                f.write_u16_be((segment_commands::START_LOOP >> 4) as u16)?;
                f.write_u16_be(*label_index)?;
                Ok(None)
            }
            Segment::EndLoop {
                label_index,
                iter_count,
                ..
            } => {
                f.write_u16_be((segment_commands::END_LOOP >> 4) as u16)?;
                f.write_u16_be((*label_index as u16 & 0x1F) | ((*iter_count as u16 & 0x7F) << 5))?;
                Ok(None)
            }
            Segment::EndCondLoopFalse {
                label_index,
                iter_count,
                ..
            } => {
                f.write_u16_be((segment_commands::END_COND_LOOP_FALSE >> 4) as u16)?;
                f.write_u16_be((*label_index as u16 & 0x1F) | ((*iter_count as u16 & 0x7F) << 5))?;
                Ok(None)
            }
            Segment::EndCondLoopTrue {
                label_index,
                iter_count,
                ..
            } => {
                f.write_u16_be((segment_commands::END_COND_LOOP_TRUE >> 4) as u16)?;
                f.write_u16_be((*label_index as u16 & 0x1F) | ((*iter_count as u16 & 0x7F) << 5))?;
                Ok(None)
            }
        }
    }
}

impl CommandSeq {
    /// Adds the position of each [Command::Branch]'s table offset to `branch_refs`, for the caller to write.
    pub fn encode<W: Write + Seek>(&self, f: &mut W, branch_refs: &mut Vec<(u64, BranchId)>) -> Result<(), Error> {
        let mut marker_to_offset = HashMap::new();
        let mut todo_detours = Vec::new();

        for Event { command, .. } in self.iter() {
            match command {
                Command::Delay(delay) => {
                    let mut delay = *delay;
                    // https://github.com/KernelEquinox/midi2bgm/blob/master/midi2bgm.cpp#L202
                    while delay > 0 {
                        if delay < 0x78 {
                            f.write_u8(delay as u8)?;
                            delay = 0;
                        } else {
                            delay -= 0x78;

                            let mask_low_extra = (delay >> 8).min(7);
                            f.write_u8(0x78 | mask_low_extra as u8)?;
                            delay -= mask_low_extra << 8;

                            let extra_byte = delay.min(0xFF);
                            f.write_u8(extra_byte as u8)?;
                            delay -= extra_byte;
                        }
                    }
                }
                Command::Note {
                    pitch,
                    velocity,
                    length,
                } => {
                    let length = if *length > 0xD3FF { 0xD3FF } else { *length };

                    f.write_u8(*pitch)?;
                    f.write_u8(*velocity)?;

                    if length < 0xC0 {
                        f.write_u8(length as u8)?;
                    } else {
                        let length = length - 0xC0;
                        // TODO: test me
                        let first_byte = (length >> 8) as u8;
                        let second_byte = length as u8;
                        f.write_all(&[first_byte | 0xC0, second_byte])?;
                    }
                }
                Command::MasterTempo(bpm) => {
                    f.write_u8(0xE0)?;
                    f.write_u16_be(*bpm)?;
                }
                Command::MasterVolume(volume) => {
                    f.write_u8(0xE1)?;
                    f.write_u8(*volume)?;
                }
                Command::MasterPitchShift { semitones } => {
                    f.write_u8(0xE2)?;
                    f.write_i8(*semitones)?;
                }
                Command::MasterTempoFade { time, value: bpm } => {
                    f.write_u8(0xE4)?;
                    f.write_u16_be(*time)?;
                    f.write_u16_be(*bpm)?;
                }
                Command::MasterVolumeFade { time, volume } => {
                    f.write_u8(0xE5)?;
                    f.write_u16_be(*time)?;
                    f.write_u8(*volume)?;
                }
                Command::MasterEffect { index: a, value: b } => {
                    f.write_u8(0xE6)?;
                    f.write_u8(*a)?;
                    f.write_u8(*b)?;
                }
                Command::TrackOverridePatch(patch) => {
                    f.write_u8(0xE8)?;
                    patch.encode(f)?;
                }
                Command::SubTrackVolume(a) => {
                    f.write_u8(0xE9)?;
                    f.write_u8(*a)?;
                }
                Command::SubTrackPan(a) => {
                    f.write_u8(0xEA)?;
                    f.write_i8(*a)?;
                }
                Command::SubTrackReverb(a) => {
                    f.write_u8(0xEB)?;
                    f.write_u8(*a)?;
                }
                Command::SegTrackVolume(a) => {
                    f.write_u8(0xEC)?;
                    f.write_u8(*a)?;
                }
                Command::SubTrackCoarseTune(a) => {
                    f.write_u8(0xED)?;
                    f.write_i8(*a)?;
                }
                Command::SubTrackFineTune(a) => {
                    f.write_u8(0xEE)?;
                    f.write_i8(*a)?;
                }
                Command::SegTrackTune { bend } => {
                    f.write_u8(0xEF)?;
                    f.write_i16_be(*bend)?;
                }
                Command::TrackTremolo { delay, speed, depth } => {
                    f.write_all(&[0xF0, *delay, *speed, *depth])?;
                }
                Command::TrackTremoloStop => f.write_u8(0xF3)?,
                Command::SetTrackVoice { index: a } => {
                    f.write_u8(0xF5)?;
                    f.write_u8(*a)?;
                }
                Command::TrackVolumeFade { time, value: volume } => {
                    f.write_u8(0xF6)?;
                    f.write_u16_be(*time)?;
                    f.write_u8(*volume)?;
                }
                Command::SubTrackReverbType { index: a } => {
                    f.write_u8(0xF7)?;
                    f.write_u8(*a)?;
                }
                Command::Detour { start_label, end_label } => {
                    f.write_u8(0xFE)?;

                    let offset = f.pos()?;
                    todo_detours.push((offset, start_label, end_label));

                    // These will be overwritten later
                    f.write_u16_be(0)?;
                    f.write_u8(0)?;
                }

                // Markers aren't actually written to the data - we just need to record their file offset for later use.
                Command::Marker { label: marker } => {
                    let offset = f.pos()?;
                    marker_to_offset.insert(marker, offset);
                }

                Command::End => f.write_u8(0)?,
                Command::BusEffect { effect_type } => {
                    f.write_u8(0xE3)?;
                    f.write_u8(*effect_type)?;
                }
                Command::TrackTremoloSpeed(value) => {
                    f.write_u8(0xF1)?;
                    f.write_u8(*value)?;
                }
                Command::TrackTremoloDepth { depth } => {
                    f.write_u8(0xF2)?;
                    f.write_u8(*depth)?;
                }
                Command::SubTrackRandomPan { pan, amount } => {
                    f.write_u8(0xF4)?;
                    f.write_u8(*pan)?;
                    f.write_u8(*amount)?;
                }
                Command::Branch { branch } => {
                    f.write_u8(0xFC)?;
                    branch_refs.push((f.pos()?, *branch));

                    // Overwritten once the branch table is written
                    f.write_u16_be(0)?;
                    f.write_u8(0)?;
                }
                Command::EventTrigger { event_info } => {
                    f.write_u8(0xFD)?;
                    f.write_all(&event_info.to_be_bytes()[1..])?;
                }
                Command::StereoDelay { index, delay } => f.write_all(&[0xFF, 1, *index, *delay])?,
                Command::SeekCustomEnvelope { index } => f.write_all(&[0xFF, 2, *index, 0])?,
                Command::WriteCustomEnvelope { time, value } => f.write_all(&[0xFF, 3, *time, *value])?,
                Command::UseCustomEnvelope { index } => f.write_all(&[0xFF, 4, *index, 0])?,
                Command::TriggerSound { sound } => f.write_all(&[0xFF, 5, *sound, 0])?,
                Command::ProxMixOverride { volume1, volume2 } => f.write_all(&[0xFF, 6, *volume1, *volume2])?,
            }
        }

        //debug!("end commandseq {:#X}", f.pos()?);
        let end_pos = SeekFrom::Start(f.pos()?);

        // Update the start/length of any subroutine commands. We have to do this after everything else, because
        // subroutines are able to reference markers that come after the subroutine jump itself.
        for (abs_subroutine_pos, start, end) in todo_detours.into_iter() {
            // Try to get the file offset of `range.start`. If it is a dropped Weak<_> or we didn't see the Marker in
            // the loop above, raise an error.
            let start_offset = *marker_to_offset
                .get(&start)
                .ok_or_else(|| Error::MissingStartMarker(start.clone()))? as u16;

            // Ditto for `range.end`.
            let end_offset = *marker_to_offset
                .get(&end)
                .ok_or_else(|| Error::MissingEndMarker(end.clone()))? as u16;

            // Calculate the length (delta between start_offset and end_offset). If this underflows, raise an error
            // [rather than panicking on debug / wrapping on release], because that would mean end_offset >
            // start_offset.
            let length = end_offset
                .checked_sub(start_offset)
                .ok_or_else(|| Error::UnorderedMarkers(end.clone()))?;

            // Convert the length to a u8 if possible. A length of 256 is written as 0, like the original tools did.
            if length > 0x100 {
                return Err(Error::EndMarkerTooFarAway(end.clone()));
            } else if length == 0x100 {
                warn!(
                    "detour to {:?} is 256 bytes long, so the game will not return from it",
                    start
                );
            }
            let length = length as u8;

            // Finally, update the start/length of the subroutine command bytes!
            f.seek(SeekFrom::Start(abs_subroutine_pos))?;
            f.write_u16_be(start_offset)?;
            f.write_u8(length)?;
        }

        f.seek(end_pos)?;
        Ok(())
    }
}
