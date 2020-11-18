use std::io::{self, prelude::*, SeekFrom};
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

// TODO
/*
impl std::error::Error for Error {

}
*/

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

impl Bgm {
    pub fn from_bytes(f: &[u8]) -> Result<Self, Error> {
        Self::parse(&mut std::io::Cursor::new(f))
    }

    fn parse<R: Read + Seek>(f: &mut R) -> Result<Self, Error> {
        f.seek(SeekFrom::Start(0))?;
        let mut magic = [0; 4];
        f.read_exact(&mut magic)?;
        if magic != *MAGIC {
            return Err(Error::InvalidMagic);
        }

        debug_assert!(f.stream_position()? == 0x04);
        let internal_size = f.read_u32_be()?;
        let true_size = f.stream_len()? as u32;
        if internal_size != true_size && align(internal_size, 8) != true_size {
            return Err(Error::SizeMismatch { true_size, internal_size });
        }

        debug_assert!(f.stream_position()? == 0x08);
        let mut name = [0; 4];
        f.read_exact(&mut name);

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
        let mut segments = (0..4)
            .into_iter()
            .map(|_| Ok(f.read_u16_be()? << 2)) // 4 contiguous u16 offsets
            .collect::<io::Result<Vec<u16>>>()? // We need to obtain all offsets before seeking to any
            .into_iter()
            .map(|pos| -> Result<Vec<Segment>, Error> {
                if pos == 0 {
                    // Null (no segments)
                    Ok(vec![])
                } else {
                    // Seek to the offset and parse the segment(s) there
                    f.seek(SeekFrom::Start(pos.into()))?;
                    let mut segments = vec![];

                    loop {
                        let segment = Segment::parse(f)?;
                        let terminate = segment.is_terminator();

                        segments.push(segment);

                        if terminate { break }
                    }

                    Ok(segments)
                }
            });

        // TODO: percussion, instruments
        //debug_assert!(f.stream_position()? == 0x24);

        Ok(Self {
            name,
            segments: [
                // We know `segments` has 4 elements, so these unwraps are safe.
                segments.next().unwrap()?,
                segments.next().unwrap()?,
                segments.next().unwrap()?,
                segments.next().unwrap()?,
            ],
        })
    }
}

impl Segment {
    fn parse<R: Read + Seek>(f: &mut R) -> Result<Self, Error> {
        // TODO
        Ok(Self {
            flags: 0,
            tracks: None,
        })
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn cloudy_climb() {
        let data = include_bytes!("../bin/Cloudy_Climb_32.bin");
        let bgm = Bgm::from_bytes(data).unwrap();

        assert_eq!(bgm, Bgm {
            name: *b"139 ",
            segments: [
                vec![
                    // TODO
                    Segment {
                        flags: 0,
                        tracks: None,
                    },
                ],
                vec![],
                vec![],
                vec![],
            ],
        });

        //assert_eq!(bgm.to_bytes().unwrap(), data);
    }

    #[test]
    #[should_panic]
    fn garbage() {
        let data = include_bytes!("../bin/extract.py");
        Bgm::from_bytes(data).unwrap();
    }
}
