use std::{collections::HashMap, io::{self, prelude::*, SeekFrom}};
use std::fmt;
use by_address::ByAddress;
use log::{debug, info};
use crate::*;

#[derive(Debug)]
pub enum Error<'a> {
    MissingStartMarker(&'a CommandRange),
    MissingEndMarker(&'a CommandRange),
    UnorderedMarkers(&'a CommandRange),
    EndMarkerTooFarAway(&'a CommandRange),
    Io(io::Error),
}

impl From<io::Error> for Error<'_> {
    fn from(io: io::Error) -> Self {
        Self::Io(io)
    }
}

impl fmt::Display for Error<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::MissingStartMarker(range) => write!(f, "Missing start marker for range '{}'", range.name),
            Error::MissingEndMarker(range) => write!(f, "Missing end marker for range '{}'", range.name),
            Error::UnorderedMarkers(range) => write!(f, "Start marker comes after end marker in range '{}'", range.name),
            Error::EndMarkerTooFarAway(range) => write!(f, "End marker is too far away from start marker in range '{}'", range.name),
            Error::Io(source) => write!(f, "{}", source),
        }
    }
}

impl std::error::Error for Error<'_> {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Error::Io(source) => Some(source),
            _ => None,
        }
    }
}

trait WriteExt: Write + Seek {
    fn write_u8(&mut self, value: u8) -> io::Result<()>;
    fn write_i8(&mut self, value: i8) -> io::Result<()>;
    fn write_u16_be(&mut self, value: u16) -> io::Result<()>;
    fn write_u32_be(&mut self, value: u32) -> io::Result<()>;

    /// Seeks to a position, writes the value, then seeks back.
    fn write_u16_be_at(&mut self, value: u16, pos: SeekFrom) -> io::Result<()>;
    fn write_u32_be_at(&mut self, value: u32, pos: SeekFrom) -> io::Result<()>;

    /// Seeks forward until the position is aligned to the given alignment.
    fn align(&mut self, alignment: u64) -> io::Result<()>;
}

impl<W: Write + Seek> WriteExt for W {
    fn write_u8(&mut self, value: u8) -> io::Result<()> {
        self.write_all(&mut [value])
    }

    fn write_i8(&mut self, value: i8) -> io::Result<()> {
        self.write_all(&mut value.to_be_bytes())
    }

    fn write_u16_be(&mut self, value: u16) -> io::Result<()> {
        self.write_all(&mut value.to_be_bytes())
    }

    fn write_u32_be(&mut self, value: u32) -> io::Result<()> {
        self.write_all(&mut value.to_be_bytes())
    }

    fn write_u16_be_at(&mut self, value: u16, pos: SeekFrom) -> io::Result<()> {
        let old_pos = self.stream_position()?;
        self.seek(pos)?;
        self.write_u16_be(value)?;
        self.seek(SeekFrom::Start(old_pos))?;
        Ok(())
    }

    fn write_u32_be_at(&mut self, value: u32, pos: SeekFrom) -> io::Result<()> {
        let old_pos = self.stream_position()?;
        self.seek(pos)?;
        self.write_u32_be(value)?;
        self.seek(SeekFrom::Start(old_pos))?;
        Ok(())
    }

    fn align(&mut self, alignment: u64) -> io::Result<()> {
        let pos = self.stream_position()?;

        if pos % alignment == 0 {
            // Nothing to do
            return Ok(());
        }

        // Calculate next multiple of `alignment`
        let rounded_pos = pos + alignment; // NEXT multiple, not closest
        let new_pos = (rounded_pos / alignment) * alignment;

        // Write zeroes
        let delta = new_pos - pos;
        for _ in 0..delta {
            self.write_u8(0)?;
        }

        Ok(())
    }
}

impl Bgm {
    pub fn encode<'a, W: Write + Seek>(&'a self, f: &'_ mut W) -> Result<(), Error<'a>> {
        f.seek(SeekFrom::Start(0))?;

        f.write_all(MAGIC)?;

        debug_assert_eq!(f.stream_position()?, 0x04);
        let file_size_offset = {
            let pos = SeekFrom::Start(f.stream_position()?);
            f.write_u32_be(0)?;
            pos
        };

        debug_assert_eq!(f.stream_position()?, 0x08);
        f.write_all(self.index.as_bytes())?;
        f.seek(SeekFrom::Start(0x0C))?; // `self.index` may have been shorter than 4 bytes

        f.write_all(&[0, 0, 0, 0, self.segments.len() as u8, 0, 0, 0])?;

        debug_assert_eq!(f.stream_position()?, 0x14);
        let segment_offsets = (0..self.segments.len())
            .into_iter()
            .map(|_| {
                let pos = f.stream_position()?;
                f.write_u16_be(0)?;
                Ok(pos)
            })
            .collect::<Result<Vec<_>, Error>>()?;
        let drums_offset = {
            let pos = SeekFrom::Start(f.stream_position()?);
            f.write_u16_be(0)?;
            pos
        };
        f.write_u16_be(self.drums.len() as u16)?;
        let voices_offset = {
            let pos = SeekFrom::Start(f.stream_position()?);
            f.write_u16_be(0)?;
            pos
        };
        f.write_u16_be(self.voices.len() as u16)?;

        debug_assert_eq!(f.stream_position()?, 0x24); // End of header struct

        // Write drums
        if self.drums.len() > 0 {
            f.align(4)?;
            let pos = (f.stream_position()? >> 2) as u16;
            f.write_u16_be_at(pos, drums_offset)?;
            for drum in self.drums.iter() {
                drum.encode(f)?;
            }
        }

        // Write voices
        if self.voices.len() > 0 {
            f.align(4)?;
            let pos = (f.stream_position()? >> 2) as u16;
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

        // Write segments
        let mut todo_segments = Vec::new();
        for (offset, segment) in segment_offsets.into_iter().zip(self.segments.iter()) {
            if let Some(subsegments) = segment {
                f.align(4)?;
                debug!("segment {:#X}", f.stream_position()?);
                // Write offset in header
                let pos = (f.stream_position()? >> 2) as u16;
                f.write_u16_be_at(pos, SeekFrom::Start(offset))?;

                // Write segment header
                let segment_start = f.stream_position()?;
                let mut todo_tracks = Vec::new();
                for subsegment in subsegments {
                    debug!("subsegment {:#X}", f.stream_position()?);
                    if let Some(tracks) = subsegment.encode(f)? {
                        todo_tracks.push(tracks); // Need to write track data after the header
                    }
                }
                f.write_all(&[0, 0, 0, 0])?; // Terminator

                todo_segments.push((segment_start, todo_tracks));
            } else {
                // Offset in header is already 0 (null)
            }
        }

        // Write segment data
        let mut encoded_tracks = HashMap::new();
        for (segment_start, mut todo_tracks) in todo_segments.into_iter() {
            todo_tracks.sort_by_key(|(_, tracks)| tracks.decoded_pos.unwrap_or_default());

            for (offset, tracks) in todo_tracks.into_iter() {
                // If we've seen these tracks already, just point to the already-encoded tracks.
                if let Some(track_data_start) = encoded_tracks.get(&Rc::as_ptr(tracks)) {
                    info!("sharing tracks at {:#X}", track_data_start);

                    // Write offset in header
                    let pos = ((track_data_start - segment_start) >> 2) as u16;
                    f.write_u16_be_at(pos, SeekFrom::Start(offset))?;

                    continue;
                }

                f.align(4)?; // This position needs to be right-shifted by 2 without loss

                let track_data_start = f.stream_position()?;
                debug!("tracks start = {:#X} (offset = {:#X})", track_data_start, track_data_start - segment_start);

                // Write offset in header
                let pos = ((track_data_start - segment_start) >> 2) as u16;
                f.write_u16_be_at(pos, SeekFrom::Start(offset))?;
                encoded_tracks.insert(Rc::as_ptr(tracks), track_data_start);

                // Write flags
                let mut todo_commands = Vec::new();
                for Track { flags, commands } in tracks.iter() {
                    //debug!("write commands_offset {:#X}", f.stream_position()?);
                    if commands.len() > 0 {
                        // Need to write command data after the track
                        todo_commands.push((f.stream_position()?, commands));
                    }
                    f.write_u16_be(0)?; // Replaced later if commands.len() > 0

                    f.write_u16_be(*flags)?;
                }

                // Write command sequences
                for (offset, seq) in todo_commands.into_iter() {
                    //debug!("commandseq = {:#X} (offset = {:#X})", f.stream_position()?, f.stream_position()? - track_data_start);

                    // Write pointer to here
                    let pos = f.stream_position()? - track_data_start; // Notice no shift
                    f.write_u16_be_at(pos as u16, SeekFrom::Start(offset))?;

                    seq.encode(f)?;
                }
            }
        }

        // Write file size
        let file_size = f.stream_position()? as u32;
        f.write_u32_be_at(file_size, file_size_offset)?;

        // Pad to 16 alignment (not actually required - ld does this anyway - but makes testing for matches easier)
        debug!("end = {:#X}", f.stream_position()?);
        f.align(16)?;
        debug!("end (aligned) = {:#X}", f.stream_position()?);

        Ok(())
    }
}

impl Drum {
    pub fn encode<'a, W: Write + Seek>(&'a self, f: &'_ mut W) -> Result<(), Error<'a>> {
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
    pub fn encode<'a, W: Write + Seek>(&'a self, f: &'_ mut W) -> Result<(), Error<'a>> {
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
    pub fn encode<'a, W: Write + Seek>(&'a self, f: &'_ mut W) -> Result<Option<(u64, &'a TaggedRc<[Track; 16]>)>, Error<'a>> {
        f.write_u8(self.flags())?;

        match self {
            Subsegment::Tracks { tracks, .. } => {
                f.write_u8(0)?;

                let tracks_pos = f.stream_position()?;
                f.write_u16_be(0)?;

                Ok(Some((tracks_pos, tracks)))
            },
            Subsegment::Unknown { flags: _, data } => {
                f.write_all(data)?;
                Ok(None)
            },
        }
    }
}

impl CommandSeq {
    pub fn encode<'a, W: Write + Seek>(&'a self, f: &'_ mut W) -> Result<(), Error<'a>> {
        let mut marker_to_offset = HashMap::new();
        let mut todo_subroutines = Vec::new();

        for command in self.iter() {
            match command {
                Command::Delay(time) => f.write_u8(*time)?,
                Command::Note { flag, pitch, velocity, length } => {
                    f.write_u8(pitch | if *flag { 1 } else { 0 })?;
                    f.write_u8(*velocity)?;
                    if *length < 0xC0 {
                        f.write_u8(*length as u8)?;
                    } else {
                        let length = *length - 0xC0;
                        // TODO: test me
                        let first_byte = (length >> 8) as u8;
                        let second_byte = length as u8;
                        f.write_all(&[first_byte | 0xC0, second_byte])?;
                    }
                },
                Command::MasterTempo(bpm) => {
                    f.write_u8(0xE0)?;
                    f.write_u16_be(*bpm)?;
                },
                Command::MasterVolume(volume) => {
                    f.write_u8(0xE1)?;
                    f.write_u8(*volume)?;
                },
                Command::MasterTranspose(shift) => {
                    f.write_u8(0xE2)?;
                    f.write_i8(*shift)?;
                },
                Command::MasterTempoFade { time, bpm } => {
                    f.write_u8(0xE4)?;
                    f.write_u16_be(*time)?;
                    f.write_u16_be(*bpm)?;
                },
                Command::MasterVolumeFade { time, volume } => {
                    f.write_u8(0xE5)?;
                    f.write_u16_be(*time)?;
                    f.write_u8(*volume)?;
                },
                Command::MasterEffect(effect) => {
                    f.write_u8(0xE6)?;
                    f.write_u8(*effect)?;
                },
                Command::TrackOverridePatch { bank, patch } => {
                    f.write_u8(0xE8)?;
                    f.write_u8(*bank)?;
                    f.write_u8(*patch)?;
                },
                Command::SubTrackVolume(a) => {
                    f.write_u8(0xE9)?;
                    f.write_u8(*a)?;
                },
                Command::SubTrackPan(a) => {
                    f.write_u8(0xEA)?;
                    f.write_u8(*a)?;
                },
                Command::SubTrackReverb(a) => {
                    f.write_u8(0xEB)?;
                    f.write_u8(*a)?;
                },
                Command::SegTrackVolume(a) => {
                    f.write_u8(0xEC)?;
                    f.write_u8(*a)?;
                },
                Command::SubTrackCoarseTune(a) => {
                    f.write_u8(0xED)?;
                    f.write_u8(*a)?;
                },
                Command::SubTrackFineTune(a) => {
                    f.write_u8(0xEE)?;
                    f.write_u8(*a)?;
                },
                Command::SegTrackTune { coarse, fine } => {
                    f.write_u8(0xEF)?;
                    f.write_u8(*coarse)?;
                    f.write_u8(*fine)?;
                },
                Command::TrackTremolo { amount, speed, unknown } => {
                    f.write_all(&[0xF0, *amount, *speed, *unknown])?;
                },
                Command::TrackTremoloStop => f.write_u8(0xF3)?,
                Command::TrackVoice(a) => {
                    f.write_u8(0xF5)?;
                    f.write_u8(*a)?;
                },
                Command::TrackVolumeFade { time, volume } => {
                    f.write_u8(0xF6)?;
                    f.write_u16_be(*time)?;
                    f.write_u8(*volume)?;
                },
                Command::SubTrackReverbType(a) => {
                    f.write_u8(0xF7)?;
                    f.write_u8(*a)?;
                },
                Command::Subroutine(range) => {
                    f.write_u8(0xFE)?;

                    let offset= f.stream_position()?;
                    todo_subroutines.push((offset, range));

                    // These will be overwritten later
                    f.write_u16_be(0)?;
                    f.write_u8(0)?;
                },
                Command::Unknown(bytes) => f.write_all(bytes)?,

                // Markers aren't actually written to the data - we just need to record their file offset for later use.
                Command::Marker(marker) => {
                    let offset = f.stream_position()?;
                    marker_to_offset.insert(marker, offset);
                },

                Command::End => f.write_u8(0)?,
            }
        }

        //debug!("end commandseq {:#X}", f.stream_position()?);
        let end_pos = SeekFrom::Start(f.stream_position()?);

        // Update the start/length of any subroutine commands. We have to do this after everything else, because
        // subroutines are able to reference markers that come after the subroutine jump itself.
        for (abs_subroutine_pos, range) in todo_subroutines.into_iter() {
            // Try to get the file offset of `range.start`. If it is a dropped Weak<_> or we didn't see the Marker in
            // the loop above, raise an error.
            let start_offset = *range.start.upgrade().and_then(|marker| {
                marker_to_offset.get(&ByAddress::from(marker))
            }).ok_or(Error::MissingStartMarker(range))? as u16;

            // Ditto for `range.end`.
            let end_offset = *range.end.upgrade().and_then(|marker| {
                marker_to_offset.get(&ByAddress::from(marker))
            }).ok_or(Error::MissingEndMarker(range))? as u16;

            // Calculate the length (delta between start_offset and end_offset). If this underflows, raise an error
            // [rather than panicking on debug / wrapping on release], because that would mean end_offset > start_offset.
            let length = end_offset.checked_sub(start_offset)
                .ok_or(Error::UnorderedMarkers(range))?;

            // Convert the length to a u8 if possible.
            if length > u8::MAX as u16 {
                return Err(Error::EndMarkerTooFarAway(range));
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
