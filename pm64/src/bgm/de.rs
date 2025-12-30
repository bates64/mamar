use std::collections::btree_map::{BTreeMap, Entry};
use std::fmt;
use std::io::prelude::*;
use std::io::{self, SeekFrom};
use std::mem::MaybeUninit;

use log::{debug, warn};

use super::*;
use crate::id::gen_id;
use crate::rw::*;

#[derive(Debug)]
pub enum Error {
    InvalidMagic,
    SizeMismatch { true_size: u32, internal_size: u32 },
    InvalidNumVariations(u8),
    UnknownSegmentCommand(u32),
    UnknownSeqCommand(u8),
    Io(io::Error),
}

impl From<io::Error> for Error {
    fn from(io: io::Error) -> Self {
        Self::Io(io)
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::InvalidMagic => write!(f, "Missing 'BGM' signature at start"),
            Error::SizeMismatch {
                true_size,
                internal_size,
            } => write!(
                f,
                "The file says it is {}B, but it is actually {}B",
                internal_size, true_size
            ),
            Error::InvalidNumVariations(num_segments) => write!(
                f,
                "Exactly 4 variations are supported, but this file has {}",
                num_segments
            ),
            Error::UnknownSegmentCommand(cmd) => write!(f, "Unknown segment command: {:#X}", cmd),
            Error::UnknownSeqCommand(cmd) => write!(f, "Unknown sequence command: {:#X}", cmd),
            Error::Io(source) => {
                if let io::ErrorKind::UnexpectedEof = source.kind() {
                    write!(f, "Unexpected end-of-file")
                } else {
                    write!(f, "{}", source)
                }
            }
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

trait CollectArray<T, E, U: Default + AsMut<[T]>>: Sized + Iterator<Item = Result<T, E>> {
    /// Doesn't panic if the iterator is too large or too small for the output array. If the iterator is too short,
    /// the remaining elements have their default value.
    #[allow(unused)]
    fn collect_array(mut self) -> Result<U, E> {
        let mut container = U::default();

        for a in container.as_mut().iter_mut() {
            match self.next() {
                None => break,
                Some(v) => *a = v?,
            }
        }

        Ok(container)
    }

    /// Same as `collect_array`, but panics if the iterator is not exactly the same size as the array.
    /// Based on https://stackoverflow.com/a/60572615
    fn collect_array_pedantic(mut self) -> Result<U, E> {
        let mut container = U::default(); // Could use std::mem::zerored and drop Default requirement here

        for a in container.as_mut().iter_mut() {
            match self.next() {
                None => panic!("iterator has too few members"),
                Some(v) => *a = v?,
            }
        }

        assert!(self.next().is_none(), "iterator has too many members");
        Ok(container)
    }
}

impl<T, E, U: Iterator<Item = Result<T, E>>, V: Default + AsMut<[T]>> CollectArray<T, E, V> for U {}

impl Bgm {
    pub fn from_bytes(f: &[u8]) -> Result<Self, Error> {
        Self::decode(&mut std::io::Cursor::new(f))
    }

    pub fn decode<R: Read + Seek>(f: &mut R) -> Result<Self, Error> {
        f.seek(SeekFrom::Start(0))?;
        let mut magic = [0; 4];
        f.read_exact(&mut magic)?;
        if magic != MAGIC.as_bytes() {
            return Err(Error::InvalidMagic);
        }

        debug_assert!(f.pos()? == 0x04);
        let internal_size = f.read_u32_be()?;
        let true_size = f.seek(SeekFrom::End(0))? as u32;
        let mamar_magic_pos = align(internal_size, 8) as u64;
        let mut has_mamar_metadata = false;
        if internal_size == true_size {
            // Ok
        } else if {
            // Check for Mamar metadata magic string
            f.seek(SeekFrom::Start(mamar_magic_pos))?;
            matches!(f.read_cstring(mamar::MAGIC_MAX_LEN as u64).as_deref(), Ok(s) if s == mamar::MAGIC)
        } {
            has_mamar_metadata = true;
        } else if align(internal_size, 16) == true_size {
            // Make sure the trailing bytes are all zero
            f.seek(SeekFrom::Start(internal_size as u64))?;
            f.read_padding(true_size - internal_size)?;
        } else {
            warn!(
                "size mismatch! BGM says it is {:#X} B but the input is {:#X} B",
                internal_size, true_size
            );
        }
        let has_mamar_metadata = has_mamar_metadata;

        let mut bgm = Bgm::new();

        f.seek(SeekFrom::Start(0x08))?;
        bgm.name = f.read_cstring(4)?;

        debug_assert!(f.pos()? == 0x0C);
        f.read_padding(4)?;

        debug_assert!(f.pos()? == 0x10);
        let num_variations = f.read_u8()?;
        if num_variations != 4 {
            return Err(Error::InvalidNumVariations(num_variations));
        }

        debug_assert!(f.pos()? == 0x11);
        f.read_padding(3)?;

        debug_assert!(f.pos()? == 0x14);
        let variation_offsets: Vec<u16> = (0..4)
            .map(|_| -> io::Result<u16> { Ok(f.read_u16_be()? << 2) }) // 4 contiguous u16 offsets
            .collect::<Result<_, _>>()?; // We need to obtain all offsets before seeking to any

        debug_assert!(f.pos()? == 0x1C);
        let drums_offset = (f.read_u16_be()? as u64) << 2;
        let drums_count = f.read_u16_be()?;
        let voices_offset = (f.read_u16_be()? as u64) << 2;
        let voices_count = f.read_u16_be()?;

        debug_assert!(f.pos()? == 0x24); // End of struct

        let mut furthest_read_pos = 0; // TODO: have `f` track this (i.e. a wrapper over f)

        // Special cases to get problematic BGMs to match
        bgm.unknowns = match bgm.name.as_str() {
            "169 " => vec![Unknown::decode(f, 0x0064..0x1294)?], /* Bowser's Castle Caves (entire segment? TODO look */
            // into this)
            "117 " => vec![Unknown::decode(f, 0x1934..0x19A0)?], // Battle Fanfare (very short segment at eof?)
            "322 " => vec![Unknown::decode(f, 0x0D15..0x0D70)?], /* Bowser's Castle Explodes (very short segment at */
            // eof?)
            _ => vec![],
        };

        bgm.variations = variation_offsets
            .iter()
            .map(|&pos| -> Result<Option<Variation>, Error> {
                if pos == 0 {
                    // Null (no segments)
                    Ok(None)
                } else {
                    // Seek to the offset and decode the segment(s) there
                    let pos = pos as u64;
                    f.seek(SeekFrom::Start(pos))?;

                    debug!("segment {:#X}", pos);

                    let mut subsegments = vec![];
                    let mut i = 0;
                    while {
                        f.seek(SeekFrom::Start(pos + i * 4))?;

                        // Peek for null terminator
                        let word = f.read_u32_be()?;
                        f.seek(SeekFrom::Current(-4))?;
                        word != 0
                    } {
                        subsegments.push(Segment::decode(f, &mut bgm, pos, &mut furthest_read_pos)?);

                        i += 1;
                    }

                    debug!("segment end {:#X}", f.pos()?);

                    Ok(Some(Variation { segments: subsegments }))
                }
            })
            .collect_array_pedantic()?;

        if drums_offset != 0 {
            f.seek(SeekFrom::Start(drums_offset))?;
            bgm.drums = (0..drums_count).map(|_| Drum::decode(f)).collect::<Result<_, _>>()?;
        }

        if voices_offset != 0 {
            f.seek(SeekFrom::Start(voices_offset))?;
            bgm.instruments = (0..voices_count)
                .map(|_| Instrument::decode(f))
                .collect::<Result<_, _>>()?;
        };

        if has_mamar_metadata {
            f.seek(SeekFrom::Start(mamar_magic_pos + mamar::MAGIC_MAX_LEN as u64))?;
            if let Ok(metadata) = rmp_serde::from_read::<_, mamar::Metadata>(&mut *f) {
                metadata.apply_to_bgm(&mut bgm);
            } else {
                warn!("unable to decode Mamar metadata, ignoring it");
            }
            furthest_read_pos = f.pos()?;
        }

        // TODO: check that all the data between furthest_read_pos and align(furthest_read_pos) is padding (zero)

        let eof_pos = f.seek(SeekFrom::End(0))?;
        if align(furthest_read_pos as u32, 16) < eof_pos as u32 {
            // TODO: make this an error
            warn!("unused data at {:#X}", furthest_read_pos);
        }

        Ok(bgm)
    }
}

impl Segment {
    fn decode<R: Read + Seek>(
        f: &mut R,
        bgm: &mut Bgm,
        start: u64,
        furthest_read_pos: &mut u64,
    ) -> Result<Self, Error> {
        // Equivalent engine func: au_bgm_player_read_segment

        debug!("subsegment {:#X}", f.pos()?);
        let data = f.read_u32_be()?;
        match data >> 12 {
            segment_commands::END => unreachable!("END should be handled by the caller"),
            segment_commands::SUBSEG => {
                f.seek(SeekFrom::Current(-2))?;
                let offset = (f.read_u16_be()? as u64) << 2;
                let track_list_pos = start + offset;
                debug!("tracks start = {:#X} (offset = {:#X})", track_list_pos, offset);

                // If we've decoded the track list at `track_list_pos` already, reference that.
                // Otherwise, decode the track there and add it to `bgm.track_lists`.
                let track_list = match bgm.find_track_list_with_pos(track_list_pos) {
                    Some(id) => id,
                    None => {
                        let mut tracks: [MaybeUninit<Track>; 16] = unsafe {
                            // SAFETY: this is an array of uninitialised elements, so the array overall does not require
                            // initialisation.
                            MaybeUninit::uninit().assume_init()
                        };

                        for (track_no, track) in tracks.iter_mut().enumerate() {
                            let track_no = track_no as u64;

                            f.seek(SeekFrom::Start(track_list_pos + track_no * 4))?;
                            *track = MaybeUninit::new(Track::decode(f, track_list_pos)?);

                            let pos = f.pos()?;
                            if pos > *furthest_read_pos {
                                *furthest_read_pos = pos;
                            }
                        }

                        bgm.add_track_list(TrackList {
                            pos: Some(track_list_pos),
                            tracks: unsafe {
                                // TODO: tbh just make this a vec, modding is a thing
                                // SAFETY: the for loop above has initialised the array. This is also how the std
                                // documentation suggests initialising an array element-by-element:
                                // https://doc.rust-lang.org/std/mem/union.MaybeUninit.html#initializing-an-array-element-by-element
                                std::mem::transmute::<[MaybeUninit<Track>; 16], [Track; 16]>(tracks)
                            },
                        })
                    }
                };

                Ok(Segment::Subseg {
                    id: Some(gen_id()),
                    track_list,
                })
            }
            segment_commands::START_LOOP => {
                f.seek(SeekFrom::Current(-2))?;
                Ok(Segment::StartLoop {
                    id: Some(gen_id()),
                    label_index: f.read_u16_be()?,
                })
            }
            segment_commands::WAIT => Ok(Segment::Wait { id: Some(gen_id()) }),
            segment_commands::END_LOOP => {
                Ok(Segment::EndLoop {
                    id: Some(gen_id()),
                    label_index: (data & 0x1F) as u8,       // bits 0-4
                    iter_count: ((data >> 5) & 0x7F) as u8, // bits 5-11
                })
            }
            segment_commands::UNKNOWN_6 => {
                Ok(Segment::Unknown6 {
                    id: Some(gen_id()),
                    label_index: (data & 0x1F) as u8,       // bits 0-4
                    iter_count: ((data >> 5) & 0x7F) as u8, // bits 5-11
                })
            }
            segment_commands::UNKNOWN_7 => {
                Ok(Segment::Unknown7 {
                    id: Some(gen_id()),
                    label_index: (data & 0x1F) as u8,       // bits 0-4
                    iter_count: ((data >> 5) & 0x7F) as u8, // bits 5-11
                })
            }
            _ => Err(Error::UnknownSegmentCommand(data)),
        }
    }
}

impl Track {
    fn decode<R: Read + Seek>(f: &mut R, segment_start: u64) -> Result<Self, Error> {
        let commands_offset = f.read_u16_be()?;
        let flags = f.read_u16_be()?;

        let is_disabled = (flags & 0x0100) != 0;
        let polyphonic_idx = ((flags & (0x7 << 0xD)) >> 0xD) as u8;
        let is_drum_track = (flags & 0x0080) != 0;
        let parent_track_idx = ((flags & (0xF << 9)) >> 9) as u8;

        Ok(Self {
            name: Default::default(),
            is_disabled,
            polyphony: Polyphony::from_raw(polyphonic_idx, parent_track_idx),
            is_drum_track,
            commands: if commands_offset == 0 {
                CommandSeq::with_capacity(0)
            } else {
                f.seek(SeekFrom::Start(segment_start + commands_offset as u64))?;
                let seq = CommandSeq::decode(f)?;

                // Assumption; structure will need changing if false for matching.
                // Maybe use command "groups" which can be represented in UI also
                assert_ne!(seq.len(), 0, "CommandSeq assumption wrong");

                seq
            },
        })
    }
}

impl CommandSeq {
    fn decode<R: Read + Seek>(f: &mut R) -> Result<Self, Error> {
        let start = f.pos()? as usize;

        // A binary tree mapping input offset -> Command. This is then trivially converted to a
        // CommandSeq by performing an in-order traversal.
        let mut events = OffsetEventMap::new();

        let mut seen_terminator = false;

        loop {
            let cmd_offset = (f.pos()? as usize) - start;

            if seen_terminator {
                // TEMP: for matching. This should really look at the BGM index and not run for all files...
                // There's probably some command that I don't yet know about that points to this data.
                if f.pos()? == 0x38EB {
                    // 0x64 Bowser's Castle
                    events.upsert_marker(0x39EB - start);
                }

                // Sometimes there is a terminator followed by some marked commands (i.e. a subroutine section), so
                // keep reading until every marker has been passed.
                if cmd_offset >= events.last_offset() {
                    break;
                }
            }

            let cmd_byte = f.read_u8()?;

            let command = match cmd_byte {
                // Sentinel (zero-terminator)
                0x00 => {
                    seen_terminator = true;
                    Command::End
                }

                // Delay
                0x01..=0x77 => Command::Delay(cmd_byte as usize),

                // Long delay
                0x78..=0x7F => {
                    // It's possible that this logic is entirely wrong, I just derived it from the inverse
                    // of the midi2bgm routine encoding delays.

                    let num_256s = (cmd_byte - 0x78) as usize;
                    let extend = f.read_u8()? as usize;

                    Command::Delay(0x78 + num_256s * 256 + extend)

                    // This logic taken from N64MidiTool
                    //Command::Delay(0x78 + (cmd_byte as usize) + ((f.read_u8()? & 7) as usize) << 8)
                }

                // Note
                0x80..=0xD3 => {
                    let pitch = cmd_byte;
                    let velocity = f.read_u8()?;
                    let length = {
                        let first_byte = f.read_u8()? as u16;

                        // This logic taken from N64MidiTool
                        if first_byte < 0xC0 {
                            first_byte
                        } else {
                            let second_byte = f.read_u8()? as u16;

                            debug_assert_eq!(first_byte & 0xC0, 0xC0);

                            0xC0 + (((first_byte & !0xC0) << 8) | second_byte)
                        }
                    };
                    //assert!(length < 0x4000, "{:#X}", length);

                    Command::Note {
                        pitch,
                        velocity,
                        length,
                    }
                }

                0xE0 => Command::MasterTempo(f.read_u16_be()?),
                0xE1 => Command::MasterVolume(f.read_u8()?),
                0xE2 => Command::MasterPitchShift { cent: f.read_u8()? },
                0xE3 => Command::UnkCmdE3 {
                    effect_type: f.read_u8()?,
                },
                0xE4 => Command::MasterTempoFade {
                    time: f.read_u16_be()?,
                    value: f.read_u16_be()?,
                },
                0xE5 => Command::MasterVolumeFade {
                    time: f.read_u16_be()?,
                    volume: f.read_u8()?,
                },
                0xE6 => Command::MasterEffect {
                    index: f.read_u8()?,
                    value: f.read_u8()?,
                },
                // command 0xE7 unused
                0xE8 => Command::TrackOverridePatch {
                    bank: f.read_u8()?,
                    patch: f.read_u8()?,
                },
                0xE9 => Command::SubTrackVolume(f.read_u8()?),
                0xEA => Command::SubTrackPan(f.read_i8()?),
                0xEB => Command::SubTrackReverb(f.read_u8()?),
                0xEC => Command::SegTrackVolume(f.read_u8()?),
                0xED => Command::SubTrackCoarseTune(f.read_u8()?),
                0xEE => Command::SubTrackFineTune(f.read_u8()?),
                0xEF => Command::SegTrackTune { bend: f.read_i16_be()? },
                0xF0 => Command::TrackTremolo {
                    amount: f.read_u8()?,
                    speed: f.read_u8()?,
                    time: f.read_u8()?,
                },
                0xF1 => Command::TrackTremoloSpeed(f.read_u8()?),
                0xF2 => Command::TrackTremoloTime { time: f.read_u8()? },
                0xF3 => Command::TrackTremoloStop,
                0xF4 => Command::UnkCmdF4 {
                    pan0: f.read_u8()?,
                    pan1: f.read_u8()?,
                },
                0xF5 => Command::SetTrackVoice { index: f.read_u8()? },
                0xF6 => Command::TrackVolumeFade {
                    time: f.read_u16_be()?,
                    value: f.read_u8()?,
                },
                0xF7 => Command::SubTrackReverbType { index: f.read_u8()? },
                // commands 0xF8-FB unused
                0xFC => Command::Jump {
                    unk_00: f.read_u16_be()?, // TODO: this is an offset, go there!!
                    unk_02: f.read_u8()?,
                },
                0xFD => Command::EventTrigger {
                    event_info: f.read_u32_be()?,
                },
                0xFE => {
                    let start_offset = f.read_u16_be()? as usize - start;
                    let end_offset = start_offset + (f.read_u8()? as usize);

                    Command::Detour {
                        start_label: events.upsert_marker(start_offset),
                        end_label: events.upsert_marker(end_offset),
                    }
                }
                0xFF => Command::UnkCmdFF {
                    unk_00: f.read_u8()?,
                    unk_01: f.read_u8()?,
                    unk_02: f.read_u8()?,
                },

                _ => return Err(Error::UnknownSeqCommand(cmd_byte)),
            };

            events.insert(cmd_offset, command.into());
        }

        let size = f.pos()? as usize - start;
        //debug!("end commandseq {:#X}", f.pos()?);

        // Explode if there are no commands (must be markers) past the end of the file
        if let Some((offset, event)) = events.0.split_off(&OffsetEventMap::atob(size)).into_iter().next() {
            panic!("command after end of parsed sequence {:?} @ {:#X}", event, offset);
        }

        Ok(events.into())
    }
}

/// Temporary struct for [CommandSeq::decode].
#[derive(Debug)]
struct OffsetEventMap(pub(self) BTreeMap<usize, Event>);

impl OffsetEventMap {
    pub fn new() -> Self {
        Self(BTreeMap::new())
    }

    /// Tree offset keys are shifted from the input to make space for abstract commands such as Command::Marker to
    /// be inserted between. This is fine, because, in the end, only the order of the keys matters (not their values).
    pub(self) fn atob(offset: usize) -> usize {
        (offset + 1) * 2
    }

    /// Performs the inverse of [`atob`](OffsetCommandMap::atob). Lossy.
    pub(self) fn btoa(key: usize) -> usize {
        key / 2
    }

    pub fn insert(&mut self, offset: usize, command: Event) {
        self.0.insert(Self::atob(offset), command);
    }

    /// Finds a marker at `offset`, or inserts it if it cannot be found.
    pub fn upsert_marker(&mut self, offset: usize) -> MarkerId {
        let shifted_offset = Self::atob(offset) - 1;

        match self.0.entry(shifted_offset) {
            Entry::Vacant(entry) => {
                // Insert the new marker here.
                let id: MarkerId = format!("Offset {:#X}", offset);
                entry.insert(Command::Marker { label: id.clone() }.into());
                id
            }
            Entry::Occupied(entry) => match entry.get() {
                Event {
                    command: Command::Marker { label },
                    ..
                } => label.clone(),
                other_command => panic!(
                    "non-marker command {:?} found in label range (shifted_offset = {:#X})",
                    other_command, shifted_offset,
                ),
            },
        }
    }

    pub fn last_offset(&self) -> usize {
        self.0
            .iter()
            .next_back() //self.0.last_key_value()
            .map_or(0, |(&k, _)| Self::btoa(k))
    }
}

impl From<OffsetEventMap> for CommandSeq {
    fn from(map: OffsetEventMap) -> CommandSeq {
        map.0.into_values().collect()
    }
}

/*
impl Deref for OffsetCommandMap {
    type Target = BTreeMap<usize, Command>;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
*/

impl Drum {
    fn decode<R: Read + Seek>(f: &mut R) -> Result<Self, Error> {
        debug!("drum = {:#X}", f.pos()?);
        Ok(Self {
            bank: f.read_u8()?,
            patch: f.read_u8()?,
            coarse_tune: f.read_u8()?,
            fine_tune: f.read_u8()?,
            volume: f.read_u8()?,
            pan: f.read_i8()?,
            reverb: f.read_u8()?,
            rand_tune: f.read_u8()?,
            rand_volume: f.read_u8()?,
            rand_pan: f.read_u8()?,
            rand_reverb: f.read_u8()?,
            pad_0b: f.read_u8()?,
        })
    }
}

impl Instrument {
    fn decode<R: Read + Seek>(f: &mut R) -> Result<Self, Error> {
        debug!("drum = {:#X}", f.pos()?);
        Ok(Self {
            bank: f.read_u8()?,
            patch: f.read_u8()?,
            volume: f.read_u8()?,
            pan: f.read_i8()?,
            reverb: f.read_u8()?,
            coarse_tune: f.read_u8()?,
            fine_tune: f.read_u8()?,
            pad_07: f.read_u8()?,
        })
    }
}

impl Unknown {
    fn decode<R: Read + Seek>(f: &mut R, range: Range<u64>) -> Result<Self, Error> {
        let range_len = range.end - range.start;

        log::warn!("forcibly reading {:X} bytes from {:X}..", range_len, range.start);

        Ok(Self {
            data: {
                let mut buf = vec![0; range_len as usize];
                f.seek(SeekFrom::Start(range.start))?;
                f.read_exact(&mut buf)?;
                buf
            },
            range,
        })
    }
}

#[cfg(test)]
mod test {
    use std::io::Cursor;

    use super::*;

    /// Make sure that parsing garbage data returns an error.
    #[test]
    fn garbage() {
        let data = include_bytes!("de.rs");
        assert!(Bgm::from_bytes(data).is_err());
    }

    #[test]
    fn decode_subroutine() {
        let bytecode: Vec<u8> = vec![
            0x01, // Delay(1) - at offset 0 (subroutine start)
            0x09, // Delay(9)
            0xFE, 0x00, 0x00, 15, // Subroutine { start = 0, length = 15 }
            0xFE, 0x00, 0x00, 15, // Subroutine { start = 0, length = 15 }
            0xFE, 0x00, 0x00, 15,   // Subroutine { start = 0, length = 15 }
            0x01, // Delay(1)
            0x00, // End - at offset 15
        ];

        let seq = CommandSeq::decode(&mut Cursor::new(bytecode)).unwrap();
        dbg!(&seq);

        let start_labels: Vec<&MarkerId> = seq
            .at_time(0)
            .into_iter()
            .take_while(|cmd| {
                matches!(
                    cmd,
                    Event {
                        command: Command::Marker { .. },
                        ..
                    }
                )
            })
            .map(|cmd| match cmd {
                Event {
                    command: Command::Marker { label },
                    ..
                } => label,
                _ => unreachable!(),
            })
            .collect();
        let end_labels: Vec<&MarkerId> = seq
            .at_time(11)
            .into_iter()
            .take_while(|cmd| {
                matches!(
                    cmd,
                    Event {
                        command: Command::Marker { .. },
                        ..
                    }
                )
            })
            .map(|cmd| match cmd {
                Event {
                    command: Command::Marker { label },
                    ..
                } => label,
                _ => unreachable!(),
            })
            .collect();
        let subroutine_labels: Vec<(&MarkerId, &MarkerId)> = seq
            .at_time(10)
            .into_iter()
            .take_while(|cmd| {
                matches!(
                    cmd,
                    Event {
                        command: Command::Detour { .. },
                        ..
                    }
                )
            })
            .map(|cmd| match cmd {
                Event {
                    command: Command::Detour {
                        start_label, end_label, ..
                    },
                    ..
                } => (start_label, end_label),
                _ => unreachable!(),
            })
            .collect();

        assert_eq!(start_labels.len(), 1);
        assert_eq!(end_labels.len(), 1);
        assert_eq!(subroutine_labels.len(), 3);

        // Check start markers
        assert_eq!(subroutine_labels[0].0, start_labels[0]);
        assert_eq!(subroutine_labels[1].0, start_labels[0]);
        assert_eq!(subroutine_labels[2].0, start_labels[0]);

        // Check end markers
        assert_eq!(subroutine_labels[0].1, end_labels[0]);
        assert_eq!(subroutine_labels[1].1, end_labels[0]);
        assert_eq!(subroutine_labels[2].1, end_labels[0]);
    }
}
