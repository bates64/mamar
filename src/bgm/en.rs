use std::collections::HashMap;
use std::fmt;
use std::io::prelude::*;
use std::io::{self, SeekFrom};

use log::{debug, info};

use super::*;
use crate::util::rw::*;

#[derive(Debug)]
pub enum Error {
    MissingStartMarker(CommandRange),
    MissingEndMarker(CommandRange),
    UnorderedMarkers(CommandRange),
    EndMarkerTooFarAway(CommandRange),
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
            Error::MissingStartMarker(range) => write!(f, "Missing start marker for range '{}'", range.name),
            Error::MissingEndMarker(range) => write!(f, "Missing end marker for range '{}'", range.name),
            Error::UnorderedMarkers(range) => {
                write!(f, "Start marker comes after end marker in range '{}'", range.name)
            }
            Error::EndMarkerTooFarAway(range) => write!(
                f,
                "End marker is too far away from start marker in range '{}'",
                range.name
            ),
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
        f.seek(SeekFrom::Start(0))?;

        f.write_all(MAGIC.as_bytes())?;

        debug_assert_eq!(f.pos()?, 0x04);
        let file_size_offset = {
            let pos = SeekFrom::Start(f.pos()?);
            f.write_u32_be(0)?;
            pos
        };

        debug_assert_eq!(f.pos()?, 0x08);
        f.write_all(&self.index.as_bytes())?;
        f.seek(SeekFrom::Start(0x0C))?;

        f.write_all(&[0, 0, 0, 0, self.segments.len() as u8, 0, 0, 0])?;

        debug_assert_eq!(f.pos()?, 0x14);
        let segment_offsets = (0..self.segments.len())
            .into_iter()
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
        f.write_u16_be(self.voices.len() as u16)?;

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

        // Write voices
        if !self.voices.is_empty() {
            f.align(4)?;
            let pos = (f.pos()? >> 2) as u16;
            f.write_u16_be_at(pos, voices_offset)?;
            for voice in self.voices.iter() {
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
                track_list_id: Id<TrackList>,
                tracks_pos: u64,
                segment_start: u64,
            },
            Unknown(Unknown),
        }
        let mut to_write: Vec<ToWrite> = self.unknowns.iter().map(|unk| ToWrite::Unknown(unk.clone())).collect();

        // Write segments
        for (offset, segment) in segment_offsets.into_iter().zip(self.segments.iter()) {
            if let Some(segment) = segment {
                f.align(4)?;
                debug!("segment {:#X}", f.pos()?);
                // Write offset in header
                let pos = (f.pos()? >> 2) as u16;
                f.write_u16_be_at(pos, SeekFrom::Start(offset))?;

                // Write segment header
                let segment_start = f.pos()?;

                for subsegment in &segment.subsegments {
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
            ToWrite::TrackList { track_list_id, .. } => self.track_lists[*track_list_id].pos.unwrap_or_default(),
            ToWrite::Unknown(unk) => unk.range.start,
        });

        let mut encoded_tracks: HashMap<Id<TrackList>, u64> = HashMap::new();

        for w in to_write.into_iter() {
            match w {
                ToWrite::TrackList {
                    segment_start,
                    track_list_id,
                    tracks_pos,
                } => {
                    let track_list = &self.track_lists[track_list_id];

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

                    // Write offset in header
                    let pos = ((track_data_start - segment_start) >> 2) as u16;
                    f.write_u16_be_at(pos, SeekFrom::Start(tracks_pos))?;
                    encoded_tracks.insert(track_list_id, track_data_start);

                    // Write flags
                    let mut todo_commands = Vec::new();
                    for Track { flags, commands } in track_list.tracks.iter() {
                        //debug!("write commands_offset {:#X}", f.pos()?);
                        if !commands.is_empty() {
                            // Need to write command data after the track
                            todo_commands.push((f.pos()?, commands));
                        }
                        f.write_u16_be(0)?; // Replaced later if commands.len() > 0

                        f.write_u16_be(*flags)?;
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
        if self.index.as_str() == "117 " && file_size == 0x19A0 {
            // Battle Fanfare's file size does not include the junk unknown at the end of it.
            file_size = 0x1998;
        } else if self.index.as_str() == "322 " && file_size == 0x0D70 {
            // Bowser's Castle Explodes
            file_size = 0x0D64;
        }

        f.write_u32_be_at(file_size, file_size_offset)?;

        // Pad to 16 alignment (not actually required - ld does this anyway - but makes testing for matches easier)
        debug!("end = {:#X}", f.pos()?);
        f.align(16)?;
        debug!("end (aligned) = {:#X}", f.pos()?);

        if f.pos()? <= 0x8A8F {
            Ok(())
        } else {
            Err(Error::TooBig)
        }
    }
}

impl Drum {
    pub fn encode<W: Write + Seek>(&self, f: &mut W) -> Result<(), Error> {
        f.write_all(&[
            self.bank,
            self.patch,
            self.coarse_tune,
            self.fine_tune,
            self.volume,
            self.pan,
            self.reverb,
            self.unk_07,
            self.unk_08,
            self.unk_09,
            self.unk_0a,
            self.unk_0b,
        ])?;
        Ok(())
    }
}

impl Voice {
    pub fn encode<W: Write + Seek>(&self, f: &mut W) -> Result<(), Error> {
        f.write_all(&[
            self.bank,
            self.patch,
            self.volume,
            self.pan,
            self.reverb,
            self.coarse_tune,
            self.fine_tune,
            self.unk_07,
        ])?;
        Ok(())
    }
}

impl Subsegment {
    pub fn encode<'a, W: Write + Seek>(&'a self, f: &'_ mut W) -> Result<Option<(u64, Id<TrackList>)>, Error> {
        f.write_u8(self.flags())?;

        match self {
            Subsegment::Tracks { track_list, .. } => {
                f.write_u8(0)?;

                let tracks_pos = f.pos()?;
                f.write_u16_be(0)?;

                Ok(Some((tracks_pos, *track_list)))
            }
            Subsegment::Unknown { flags: _, data } => {
                f.write_all(data)?;
                Ok(None)
            }
        }
    }
}

impl CommandSeq {
    pub fn encode<W: Write + Seek>(&self, f: &mut W) -> Result<(), Error> {
        let mut marker_to_offset = HashMap::new();
        let mut todo_subroutines = Vec::new();

        for command in self.iter() {
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
                    flag,
                    pitch,
                    velocity,
                    length,
                } => {
                    let length = if *length > 0xD3FF { 0xD3FF } else { *length };

                    f.write_u8(pitch | if *flag { 1 } else { 0 })?;
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
                Command::MasterTranspose(shift) => {
                    f.write_u8(0xE2)?;
                    f.write_i8(*shift)?;
                }
                Command::MasterTempoFade { time, bpm } => {
                    f.write_u8(0xE4)?;
                    f.write_u16_be(*time)?;
                    f.write_u16_be(*bpm)?;
                }
                Command::MasterVolumeFade { time, volume } => {
                    f.write_u8(0xE5)?;
                    f.write_u16_be(*time)?;
                    f.write_u8(*volume)?;
                }
                Command::MasterEffect(effect) => {
                    f.write_u8(0xE6)?;
                    f.write_u8(*effect)?;
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
                    f.write_u8(*a)?;
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
                Command::SegTrackTune { coarse, fine } => {
                    f.write_u8(0xEF)?;
                    f.write_u8(*coarse)?;
                    f.write_u8(*fine)?;
                }
                Command::TrackTremolo { amount, speed, unknown } => {
                    f.write_all(&[0xF0, *amount, *speed, *unknown])?;
                }
                Command::TrackTremoloStop => f.write_u8(0xF3)?,
                Command::TrackVoice(a) => {
                    f.write_u8(0xF5)?;
                    f.write_u8(*a)?;
                }
                Command::TrackVolumeFade { time, volume } => {
                    f.write_u8(0xF6)?;
                    f.write_u16_be(*time)?;
                    f.write_u8(*volume)?;
                }
                Command::SubTrackReverbType(a) => {
                    f.write_u8(0xF7)?;
                    f.write_u8(*a)?;
                }
                Command::Subroutine(range) => {
                    f.write_u8(0xFE)?;

                    let offset = f.pos()?;
                    todo_subroutines.push((offset, range));

                    // These will be overwritten later
                    f.write_u16_be(0)?;
                    f.write_u8(0)?;
                }
                Command::Unknown(bytes) => f.write_all(bytes)?,

                // Markers aren't actually written to the data - we just need to record their file offset for later use.
                Command::Marker(marker) => {
                    let offset = f.pos()?;
                    marker_to_offset.insert(marker, offset);
                }

                Command::End => f.write_u8(0)?,
            }
        }

        //debug!("end commandseq {:#X}", f.pos()?);
        let end_pos = SeekFrom::Start(f.pos()?);

        // Update the start/length of any subroutine commands. We have to do this after everything else, because
        // subroutines are able to reference markers that come after the subroutine jump itself.
        for (abs_subroutine_pos, range) in todo_subroutines.into_iter() {
            // Try to get the file offset of `range.start`. If it is a dropped Weak<_> or we didn't see the Marker in
            // the loop above, raise an error.
            let start_offset = *marker_to_offset
                .get(&range.start)
                .ok_or_else(|| Error::MissingStartMarker(range.clone()))? as u16;

            // Ditto for `range.end`.
            let end_offset = *marker_to_offset
                .get(&range.end)
                .ok_or_else(|| Error::MissingEndMarker(range.clone()))? as u16;

            // Calculate the length (delta between start_offset and end_offset). If this underflows, raise an error
            // [rather than panicking on debug / wrapping on release], because that would mean end_offset >
            // start_offset.
            let length = end_offset
                .checked_sub(start_offset)
                .ok_or_else(|| Error::UnorderedMarkers(range.clone()))?;

            // Convert the length to a u8 if possible.
            if length > u8::MAX as u16 {
                return Err(Error::EndMarkerTooFarAway(range.clone()));
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
