use std::io::{self, prelude::*, SeekFrom};
use std::fmt;
use std::collections::BTreeMap;
use std::rc::Rc;
use smallvec::smallvec;
use crate::*;

#[derive(Debug)]
pub enum Error {
    InvalidMagic,
    SizeMismatch { true_size: u32, internal_size: u32 },
    InvalidNumSegments(u8),
    NonZeroPadding,
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
            Error::InvalidMagic => write!(f, "Missing 'BGM' signature at start of file"),
            Error::SizeMismatch {
                true_size, internal_size,
            } => write!(f, "The file says it is {}B, but it is actually {}B", internal_size, true_size),
            Error::InvalidNumSegments(num_segments) =>
                write!(f, "Exactly 4 segment slots are supported, but this file has {}", num_segments),
            Error::NonZeroPadding => write!(f, "Expected padding but found non-zero byte(s)"),
            Error::Io(source) => if let io::ErrorKind::UnexpectedEof = source.kind() {
                write!(f, "Unexpected end-of-file")
            } else {
                write!(f, "{}", source)
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

trait ReadExt: Read {
    fn read_u8(&mut self) -> io::Result<u8>;
    fn read_i8(&mut self) -> io::Result<i8>;
    fn read_u16_be(&mut self) -> io::Result<u16>;
    fn read_u32_be(&mut self) -> io::Result<u32>;
    fn read_padding(&mut self, num_bytes: u32) -> Result<(), Error>;
}

impl<R: Read> ReadExt for R {
    fn read_u8(&mut self) -> io::Result<u8> {
        let mut buffer = [0; 1];
        self.read_exact(&mut buffer)?;
        Ok(buffer[0])
    }

    fn read_i8(&mut self) -> io::Result<i8> {
        self.read_u8().map(|i| i as i8)
    }

    fn read_u16_be(&mut self) -> io::Result<u16> {
        let mut buffer = [0; 2];
        self.read_exact(&mut buffer)?;
        Ok(u16::from_be_bytes(buffer))
    }


    fn read_u32_be(&mut self) -> io::Result<u32> {
        let mut buffer = [0; 4];
        self.read_exact(&mut buffer)?;
        Ok(u32::from_be_bytes(buffer))
    }

    fn read_padding(&mut self, num_bytes: u32) -> Result<(), Error> {
        for _ in 0..num_bytes {
            if self.read_u8()? != 0 {
                return Err(Error::NonZeroPadding);
            }
        }

        Ok(())
    }
}

trait CollectArray<T, E, U: Default + AsMut<[T]>>: Sized + Iterator<Item = Result<T, E>> {
    /// Doesn't panic if the iterator is too large or too small for the output array. If the iterator is too short,
    /// the remaining elements have their default value.
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
        if magic != *MAGIC {
            return Err(Error::InvalidMagic);
        }

        debug_assert!(f.stream_position()? == 0x04);
        let internal_size = f.read_u32_be()?;
        let true_size = f.stream_len()? as u32;
        if internal_size == true_size {
            // Ok
        } else if align(internal_size, 16) == true_size {
            // Make sure the trailing bytes are all zero
            f.seek(SeekFrom::Start(internal_size as u64))?;
            f.read_padding(true_size - internal_size)?;

            f.seek(SeekFrom::Start(0x08))?; // Back to where we were
        } else {
            return Err(Error::SizeMismatch { true_size, internal_size });
        }

        debug_assert!(f.stream_position()? == 0x08);
        let mut name = [0; 4];
        f.read_exact(&mut name)?;

        debug_assert!(f.stream_position()? == 0x0C);
        f.read_padding(4)?;

        debug_assert!(f.stream_position()? == 0x10);
        let num_segments = f.read_u8()?;
        if num_segments != 4 {
            return Err(Error::InvalidNumSegments(num_segments));
        }

        debug_assert!(f.stream_position()? == 0x11);
        f.read_padding(3)?;

        debug_assert!(f.stream_position()? == 0x14);
        let segment_offsets: [u16; 4] = (0..4)
            .into_iter()
            .map(|_| -> io::Result<u16> { Ok(f.read_u16_be()? << 2) }) // 4 contiguous u16 offsets
            .collect_array()?; // We need to obtain all offsets before seeking to any

        // TODO: percussion, instruments
        //debug_assert!(f.stream_position()? == 0x24);

        Ok(Self {
            name,
            segments: segment_offsets
                .iter()
                .map(|&pos| -> Result<Option<Segment>, Error> {
                    if pos == 0 {
                        // Null (no segments)
                        Ok(None)
                    } else {
                        // Seek to the offset and decode the segment(s) there
                        let pos = pos as u64;
                        f.seek(SeekFrom::Start(pos))?;

                        let mut segment = vec![];
                        let mut i = 0;
                        while {
                            f.seek(SeekFrom::Start(pos + i * 4))?;

                            // Peek for null terminator
                            let byte = f.read_u8()?;
                            f.seek(SeekFrom::Current(-1))?;
                            byte != 0
                        } {
                            segment.push(Subsegment::decode(f, pos)?);

                            i += 1;
                        }

                        Ok(Some(segment))
                    }
                })
                .collect_array_pedantic()?,
        })
    }
}

impl Subsegment {
    fn decode<R: Read + Seek>(f: &mut R, start: u64) -> Result<Self, Error> {
        let flags = f.read_u8()?;

        if flags & 0x70 == 0x10 {
            f.read_padding(1)?;
            let offset = (f.read_u16_be()? as u64) << 2;

            let tracks_start = start + offset;

            Ok(Subsegment::Tracks {
                flags,
                tracks: (0..16)
                    .into_iter()
                    .map(|track_no| {
                        f.seek(SeekFrom::Start(tracks_start + track_no * 4))?;
                        Track::decode(f, tracks_start)
                    })
                    .collect_array_pedantic()?
            })
        } else {
            let mut data = [0; 3];
            f.read_exact(&mut data)?;

            Ok(Subsegment::Unknown {
                flags,
                data,
            })
        }
    }
}

impl Track {
    fn decode<R: Read + Seek>(f: &mut R, segment_start: u64) -> Result<Self, Error> {
        let commands_offset = f.read_u16_be()?;
        let flags = f.read_u16_be()?;

        Ok(Self {
            flags,
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
        let start = f.stream_position()? as usize;

        // A binary tree mapping input offset -> Command. This is then trivially converted to a
        // CommandSeq by performing an in-order traversal.
        let mut commands = BTreeMap::new();

        // Tree offset keys are shifted from the input to make space for abstract commands such as Command::Label to
        // be inserted between. This is fine, because, in the end, only the order of the keys matter (not their values).
        let offset_key_command = |offset: usize| (offset + 1) << 1;
        let offset_key_label= |offset: usize| offset_key_command(offset) - 1;

        loop {
            let cmd_offset = (f.stream_position()? as usize) - start;
            let cmd_byte = f.read_u8()?;

            let command = match cmd_byte {
                // Sentinel (zero-terminator)
                0x00 => break,

                // Delay
                0x01..=0x77 => Command::Delay(cmd_byte),

                // TODO: this doesn't seem like a long delay; needs testing. Leaving as Unknown for now
                // Long delay
                0x78..=0x7F => {
                    /*
                    // This logic taken from N64MidiTool
                    Command::Delay(0x78 + cmd_byte + (f.read_u8()? & 0x7) << 8));
                    */
                    Command::Unknown(smallvec![cmd_byte, f.read_u8()?])
                },

                // Note
                0x80..=0xD3 => {
                    let flag = (cmd_byte & 1) != 0;
                    let pitch = cmd_byte & !1;

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

                    Command::Note { pitch, flag, velocity, length }
                },

                0xE0 => Command::MasterTempo(f.read_u16_be()?),
                0xE1 => Command::MasterVolume(f.read_u8()?),
                0xE2 => Command::MasterTranspose(f.read_i8()?),
                0xE3 => Command::Unknown(smallvec![0xE3, f.read_u8()?]),
                0xE4 => Command::MasterTempoFade { time: f.read_u16_be()?, bpm: f.read_u16_be()? },
                0xE5 => Command::MasterVolumeFade { time: f.read_u16_be()?, volume: f.read_u8()? },
                0xE6 => Command::MasterEffect(f.read_u8()?),
                0xE7 => Command::Unknown(smallvec![0xE7]),
                0xE8 => Command::TrackOverridePatch { bank: f.read_u8()?, patch: f.read_u8()? },
                0xE9 => Command::SubTrackVolume(f.read_u8()?),
                0xEA => Command::SubTrackPan(f.read_u8()?),
                0xEB => Command::SubTrackReverb(f.read_u8()?),
                0xEC => Command::SegTrackVolume(f.read_u8()?),
                0xED => Command::SubTrackCoarseTune(f.read_u8()?),
                0xEE => Command::SubTrackFineTune(f.read_u8()?),
                0xEF => Command::SegTrackTune { coarse: f.read_u8()?, fine: f.read_u8()? },
                0xF0 => Command::TrackTremolo {
                    amount: f.read_u8()?,
                    speed: f.read_u8()?,
                    unknown: f.read_u8()?,
                },
                0xF1 => Command::Unknown(smallvec![0xF1, f.read_u8()?]),
                0xF2 => Command::Unknown(smallvec![0xF2, f.read_u8()?]),
                0xF3 => Command::TrackTremoloStop,
                0xF4 => Command::Unknown(smallvec![0xF4, f.read_u8()?, f.read_u8()?]),
                0xF5 => Command::TrackVoice(f.read_u8()?),
                0xF6 => Command::TrackVolumeFade { time: f.read_u16_be()?, volume: f.read_u8()? },
                0xF7 => Command::SubTrackReverbType(f.read_u8()?),
                0xF8 => Command::Unknown(smallvec![0xF8]),
                0xF9 => Command::Unknown(smallvec![0xF9]),
                0xFA => Command::Unknown(smallvec![0xFA]),
                0xFB => Command::Unknown(smallvec![0xFB]),
                0xFC => {
                    // TODO Jump random
                    Command::Unknown(smallvec![0xFC, f.read_u8()?, f.read_u8()?, f.read_u8()?, f.read_u8()?])
                },
                0xFD => Command::Unknown(smallvec![0xFD, f.read_u8()?, f.read_u8()?, f.read_u8()?]),
                0xFE => {
                    // Create or reuse a Label pointing to the target offset.
                    let target_offset = f.read_u16_be()? as usize;
                    let label = commands
                        .entry(offset_key_label(target_offset)) // Label immediately before the target offset
                        .or_insert_with(|| Command::Label(
                            Rc::new(Label::new(format!("Offset {:#X}", target_offset))))
                        );

                    if let Command::Label(label) = label {
                        Command::Subroutine {
                            target: label.clone(),
                            length: f.read_u8()?,
                        }
                    } else {
                        // There may not be a non-label at any (x << 1) - 1 index.
                        unreachable!();
                    }
                },
                0xFF => Command::Unknown(smallvec![0xFF, f.read_u8()?, f.read_u8()?, f.read_u8()?]),

                _ => Command::Unknown(smallvec![cmd_byte]),
            };

            commands.insert(offset_key_command(cmd_offset), command);
        }

        Ok(commands.into_values().collect())
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use std::{path::Path, fs::File, io::Cursor};
    use insta::assert_yaml_snapshot;

    /// Make sure that parsing garbage data returns an error.
    #[test]
    fn garbage() {
        let data = include_bytes!("../bin/extract.py");
        assert!(Bgm::from_bytes(data).is_err());
    }

    #[test]
    fn decode_subroutine() {
        let bytecode: Vec<u8> = vec![
            0x01, // Delay(1) - at offset 0
            0x09, // Delay(9)
            0xFE, 0x00, 0x00, 0x10, // Subroutine { offset = 0, length = 0x10 } - at t=10
            0x00, // End
        ];

        let seq = CommandSeq::decode(&mut Cursor::new(bytecode)).unwrap();

        let label = seq.at_time(0)[0];

        if let Command::Label(label) = label {
            if let Command::Subroutine { target, length } = seq.at_time(10)[0] {
                assert!(Rc::ptr_eq(label, target));
                assert_eq!(*length, 0x10);
            } else {
                panic!("subroutine should be inserted at t=10");
            }
        } else {
            panic!("label should be inserted at t=0");
        }
    }

    /// Parses every BGM file at bin/*.bin (extract these with bin/extract.py).
    /// Use `cargo install cargo-install` then `cargo insta test` to run.
    #[test]
    fn all_songs_snapshot() {
        let bin_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("bin");

        for entry in bin_dir.read_dir().expect("bin dir") {
            if let Ok(entry) = entry {
                let path = entry.path();
                if let Some(ext) = path.extension() {
                    if ext == "bin" && path.is_file() {
                        let mut file = File::open(&path).expect("bin file");
                        let bgm = Bgm::decode(&mut file).unwrap();

                        let test_name = path.file_stem().unwrap().to_string_lossy().to_string();

                        assert_yaml_snapshot!(test_name, bgm);
                    }
                }
            }
        }
    }
}
