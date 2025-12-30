use std::collections::HashMap;
use std::fmt;
use std::io::prelude::*;
use std::io::{self, SeekFrom};

use log::{debug, info, warn};

use super::*;
use crate::rw::*;

#[derive(Debug)]
pub enum Error {
    MissingStartMarker(MarkerId),
    MissingEndMarker(MarkerId),
    UnorderedMarkers(MarkerId),
    EndMarkerTooFarAway(MarkerId),
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
        */

        enum ToWrite {
            TrackList {
                track_list_id: TrackListId,
                tracks_pos: u64,
                segment_start: u64,
            },
            Unknown(Unknown),
        }
        let mut to_write: Vec<ToWrite> = self.unknowns.iter().map(|unk| ToWrite::Unknown(unk.clone())).collect();

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
                        to_write.push(ToWrite::TrackList {
                            track_list_id,
                            tracks_pos,
                            segment_start,
                        });
                    }
                }
                f.write_all(&[0, 0, 0, 0])?; // Terminator
            } else {
                // Offset in header is already 0 (null)
            }
        }

        // Write track lists

        to_write.sort_by_key(|w| match w {
            ToWrite::TrackList { track_list_id, .. } => self.track_lists[track_list_id].pos.unwrap_or_default(),
            ToWrite::Unknown(unk) => unk.range.start,
        });

        let mut encoded_tracks: HashMap<TrackListId, u64> = HashMap::new();

        for w in to_write.into_iter() {
            match w {
                ToWrite::TrackList {
                    segment_start,
                    track_list_id,
                    tracks_pos,
                } => {
                    let track_list = &self.track_lists[&track_list_id];

                    // If we've encoded this track list already, just point to that instead.
                    if let Some(track_data_start) = encoded_tracks.get(&track_list_id) {
                        info!("sharing tracks at {:#X}", track_data_start);

                        // Write offset in header
                        let pos = ((track_data_start - segment_start) >> 2) as u16;
                        f.write_u16_be_at(pos, SeekFrom::Start(tracks_pos))?;

                        continue;
                    }

                    f.align(4)?; // This position needs to be right-shifted by 2 without loss

                    // For matching
                    let track_data_start = if let Some(pos) = track_list.pos {
                        // TODO: turn track_list.pos into a range and make sure this will fit there
                        f.seek(SeekFrom::Start(pos))?;
                        pos
                    } else {
                        f.pos()?
                    };

                    debug!(
                        "tracks start = {:#X} (offset = {:#X})",
                        track_data_start,
                        track_data_start - segment_start
                    );

                    let track_list_no = encoded_tracks.len();

                    // Write offset in header
                    let pos = ((track_data_start - segment_start) >> 2) as u16;
                    f.write_u16_be_at(pos, SeekFrom::Start(tracks_pos))?;
                    encoded_tracks.insert(track_list_id, track_data_start);

                    // Write flags
                    let mut todo_commands = Vec::new();
                    for (
                        track_no,
                        Track {
                            name,
                            is_disabled,
                            polyphony,
                            is_drum_track,
                            commands,
                            ..
                        },
                    ) in track_list.tracks.iter().enumerate()
                    {
                        if track_no != 0 {
                            metadata.add_track_name(track_list_no as u16 + 1, name.clone());
                        }

                        if !commands.is_empty() {
                            // Need to write command data after the track
                            todo_commands.push((f.pos()?, commands));
                        }
                        f.write_u16_be(0)?; // Replaced later if !null

                        let polyphonic_idx = match *polyphony {
                            Polyphony::Automatic => polyphony_to_polyphonic_idx(commands.max_polyphony()),
                            Polyphony::Manual { voices } => polyphony_to_polyphonic_idx(voices),
                            Polyphony::Link { parent: _ } => {
                                // Dry Dry Desert (only song that uses Link) happens to use this value
                                5
                            }
                            Polyphony::Other { priority } => priority,
                        };

                        let flags = (*is_disabled as u16) << 8
                            | (polyphonic_idx as u16) << 0xD
                            | if *is_drum_track { 0x0080 } else { 0 }
                            | (polyphony.to_parent_idx() as u16) << 9;
                        f.write_u16_be(flags)?;
                    }

                    // Write command sequences
                    for (offset, seq) in todo_commands.into_iter() {
                        //debug!("commandseq = {:#X} (offset = {:#X})", f.pos()?, f.pos()? - track_data_start);

                        // Write pointer to here
                        let pos = f.pos()? - track_data_start; // Notice no shift
                        f.write_u16_be_at(pos as u16, SeekFrom::Start(offset))?;

                        seq.encode(f)?;
                    }
                }
                ToWrite::Unknown(unk) => {
                    f.seek(SeekFrom::Start(unk.range.start))?;
                    debug!(
                        "write unknown {:X}..{:X} @ {:X}",
                        unk.range.start,
                        unk.range.end,
                        f.pos()?
                    );
                    f.write_all(&unk.data)?;
                    f.seek(SeekFrom::Start(unk.range.end))?;
                }
            }
        }

        // Write file size
        let mut file_size = f.pos()? as u32;

        // Matching: file size overrides (!)
        if self.name.as_str() == "117 " && file_size == 0x19A0 {
            // Battle Fanfare's file size does not include the junk unknown at the end of it.
            file_size = 0x1998;
        } else if self.name.as_str() == "322 " && file_size == 0x0D70 {
            // Bowser's Castle Explodes
            file_size = 0x0D64;
        }

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

impl Drum {
    pub fn encode<W: Write + Seek>(&self, f: &mut W) -> Result<(), Error> {
        f.write_u8(self.bank)?;
        f.write_u8(self.patch)?;
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
        f.write_u8(self.bank)?;
        f.write_u8(self.patch)?;
        f.write_u8(self.volume)?;
        f.write_i8(self.pan)?;
        f.write_u8(self.reverb)?;
        f.write_u8(self.coarse_tune)?;
        f.write_u8(self.fine_tune)?;
        f.write_u8(self.pad_07)?;
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
            Segment::Unknown6 {
                label_index,
                iter_count,
                ..
            } => {
                f.write_u16_be((segment_commands::UNKNOWN_6 >> 4) as u16)?;
                f.seek(SeekFrom::Current(-2))?;
                f.write_u16_be((*label_index as u16 & 0x1F) | ((*iter_count as u16 & 0x7F) << 5))?;
                Ok(None)
            }
            Segment::Unknown7 {
                label_index,
                iter_count,
                ..
            } => {
                f.write_u16_be((segment_commands::UNKNOWN_7 >> 4) as u16)?;
                f.seek(SeekFrom::Current(-2))?;
                f.write_u16_be((*label_index as u16 & 0x1F) | ((*iter_count as u16 & 0x7F) << 5))?;
                Ok(None)
            }
        }
    }
}

impl CommandSeq {
    pub fn encode<W: Write + Seek>(&self, f: &mut W) -> Result<(), Error> {
        let mut marker_to_offset = HashMap::new();
        let mut todo_detours = Vec::new();

        for Event { command, .. } in self.iter() {
            match command {
                Command::Delay(mut delay) => {
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

                            let extra_byte = match delay {
                                d if d > 0x78 => 0x78,
                                d if d > 0x00 => d,
                                _ => 0,
                            };
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
                Command::MasterPitchShift { cent: shift } => {
                    f.write_u8(0xE2)?;
                    f.write_u8(*shift)?;
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
                Command::TrackOverridePatch { bank, patch } => {
                    f.write_u8(0xE8)?;
                    f.write_u8(*bank)?;
                    f.write_u8(*patch)?;
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
                    f.write_u8(*a)?;
                }
                Command::SubTrackFineTune(a) => {
                    f.write_u8(0xEE)?;
                    f.write_u8(*a)?;
                }
                Command::SegTrackTune { bend } => {
                    f.write_u8(0xEF)?;
                    f.write_i16_be(*bend)?;
                }
                Command::TrackTremolo {
                    amount,
                    speed,
                    time: unknown,
                } => {
                    f.write_all(&[0xF0, *amount, *speed, *unknown])?;
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
                Command::UnkCmdE3 { effect_type } => {
                    f.write_u8(0xE3)?;
                    f.write_u8(*effect_type)?;
                }
                Command::TrackTremoloSpeed(value) => {
                    f.write_u8(0xF1)?;
                    f.write_u8(*value)?;
                }
                Command::TrackTremoloTime { time } => {
                    f.write_u8(0xF2)?;
                    f.write_u8(*time)?;
                }
                Command::UnkCmdF4 { pan0, pan1 } => {
                    f.write_u8(0xF4)?;
                    f.write_u8(*pan0)?;
                    f.write_u8(*pan1)?;
                }
                Command::Jump { unk_00, unk_02 } => {
                    f.write_u8(0xF8)?;
                    f.write_u16_be(*unk_00)?;
                    f.write_u8(*unk_02)?;
                }
                Command::EventTrigger { event_info } => {
                    f.write_u8(0xF9)?;
                    f.write_u32_be(*event_info)?;
                }
                Command::UnkCmdFF { unk_00, unk_01, unk_02 } => {
                    f.write_u8(0xFF)?;
                    f.write_u8(*unk_00)?;
                    f.write_u8(*unk_01)?;
                    f.write_u8(*unk_02)?;
                }
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

            // Convert the length to a u8 if possible.
            if length > u8::MAX as u16 {
                return Err(Error::EndMarkerTooFarAway(end.clone()));
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

/// Performs the inverse of `player->unk_22A[polyphony]`
fn polyphony_to_polyphonic_idx(polyphony: u8) -> u8 {
    match polyphony {
        0 => 0,
        1 => 1,
        2 => 5,
        3 => 6,
        _ => 7,
    }
}
