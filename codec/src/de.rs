use std::io::{self, prelude::*, SeekFrom};
use std::fmt;
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
    fn read_u16_be(&mut self) -> io::Result<u16>;
    fn read_u32_be(&mut self) -> io::Result<u32>;
    fn read_padding(&mut self, num_bytes: usize) -> Result<(), Error>;
}

impl<R: Read> ReadExt for R {
    fn read_u8(&mut self) -> io::Result<u8> {
        let mut buffer = [0; 1];
        self.read_exact(&mut buffer)?;
        Ok(buffer[0])
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

    fn read_padding(&mut self, num_bytes: usize) -> Result<(), Error> {
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
        if internal_size != true_size && align(internal_size, 16) != true_size {
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
                let mut commands = CommandSeq::with_capacity(1);

                // TODO
                commands.push(Command::default()); // TEMP

                // Assumption; structure will need changing if false for matching.
                // Maybe use command "groups" which can be represented in UI also
                assert_ne!(commands.len(), 0);

                commands
            },
        })
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use pretty_assertions::assert_eq;
    use std::{path::Path, fs::File};

    #[test]
    fn cloudy_climb() {
        // TODO
        /*
        let data = include_bytes!("../bin/Cloudy_Climb_32.bin");
        let bgm = Bgm::from_bytes(data).unwrap();

        assert_eq!(bgm, Bgm {
            name: *b"139 ",
            segments: [
                // 0x24
                Some(vec![
                    Subsegment::Unknown {
                        flags: 0x30,
                        data: [0x00, 0x00, 0x00],
                    },

                    Subsegment::Tracks {
                        flags: 0x10,
                        tracks: [
                            // 0x34
                            Track {
                                flags: 0x0000,
                                // 0x74
                                commands: vec![
                                    // TODO
                                ],
                            },

                            // 0x38
                            Track {
                                flags: 0x2000,
                                // 0x8D
                                commands: vec![
                                    // TODO
                                ],
                            },

                            // 0x3C
                            Track {
                                flags: 0x2000,
                                // 0x159
                                commands: vec![
                                    // TODO
                                ],
                            },

                            // 0x40
                            Track {
                                flags: 0xE000, // Percussion
                                // 0x22D
                                commands: vec![
                                    // TODO
                                ],
                            },

                            // 0x44
                            Track {
                                flags: 0xE000, // Percussion
                                // 0x2D0
                                commands: vec![
                                    // TODO
                                ],
                            },

                            // 0x48
                            Track {
                                flags: 0x2000,
                                // 0x374
                                commands: vec![
                                    // TODO
                                ],
                            },

                            // 0x4C
                            Track {
                                flags: 0x2000,
                                // 0x3A7
                                commands: vec![
                                    // TODO
                                ],
                            },

                            Track::default(),
                            Track::default(),
                            Track::default(),
                            Track::default(),
                            Track::default(),
                            Track::default(),
                            Track::default(),
                            Track::default(),
                            Track::default(),
                        ],
                    },

                    Subsegment::Unknown {
                        flags: 0x50,
                        data: [0x00, 0x00, 0x00],
                    },
                ]),
                None,
                None,
                None,
            ],
        });
        */
    }

    #[test]
    #[should_panic]
    fn garbage() {
        let data = include_bytes!("../bin/extract.py");
        Bgm::from_bytes(data).unwrap();
    }

    /// Parses every BGM file at bin/*.bin. We don't check that they match any expected output (unlike `cloudy_climb`),
    /// but if the parsing were unsound something would almost certainly explode (e.g. seek and read past EOF).
    #[test]
    fn all_songs_ok() {
        let bin_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("bin");

        for entry in bin_dir.read_dir().expect("bin dir") {
            if let Ok(entry) = entry {
                let path = entry.path();
                if let Some(ext) = path.extension() {
                    if ext == "bin" && path.is_file() {
                        println!("reading {:?}", path.file_name().unwrap());

                        let mut file = File::open(path).expect("bin file");
                        Bgm::decode(&mut file).unwrap();
                    }
                }
            }
        }
    }
}
