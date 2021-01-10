use std::io::{self, prelude::*, SeekFrom};
use std::fmt;
use std::convert::TryInto;
use log::warn;
use super::*;

#[derive(Debug)]
pub enum Error {
    InvalidMagic,
    Io(io::Error),
}

type Result<T> = std::result::Result<T, Error>;

impl From<io::Error> for Error {
    fn from(io: io::Error) -> Self {
        Self::Io(io)
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::InvalidMagic => write!(f, "Missing 'SBN' signature at start"),
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

impl Sbn {
    pub fn from_bytes(f: &[u8]) -> Result<Self> {
        Self::decode(&mut std::io::Cursor::new(f))
    }

    pub fn decode<R: Read + Seek>(f: &mut R) -> Result<Self> {
        if f.read_cstring(4)? != MAGIC {
            return Err(Error::InvalidMagic);
        }

        debug_assert!(f.pos()? == 0x04);
        let internal_size = f.read_u32_be()?;
        let true_size = f.seek(SeekFrom::End(0))? as u32;
        if internal_size == true_size {
            // Ok
        } else if align(internal_size, 16) == true_size {
            // Make sure the trailing bytes are all zero
            f.seek(SeekFrom::Start(internal_size as u64))?;
            f.read_padding(true_size - internal_size)?;
        } else {
            warn!("size mismatch! SBN says it is {:#X} B but the input is {:#X} B", internal_size, true_size);
        }

        f.seek(SeekFrom::Start(0x08))?;
        f.read_padding(8)?;

        let files_start = f.read_u32_be()?;
        let num_files = f.read_u32_be()?;

        f.seek(SeekFrom::Current(12))?; // TODO: what is this data

        let songs_start = f.read_u32_be()?;

        let mut sbn = Self {
            files: Vec::with_capacity(num_files as usize),
            songs: Vec::new(),
        };

        for i in 0..num_files {
            f.seek(SeekFrom::Start((files_start + i * 8) as u64))?;

            let file_start = f.read_u32_be()?;

            f.seek(SeekFrom::Start(file_start as u64))?;

            let _file_magic = f.read_cstring(4)?;
            let file_size = f.read_u32_be()?;

            sbn.files.push(File {
                name: f.read_cstring(4)?,
                data: {
                    f.seek(SeekFrom::Start(file_start as u64))?;

                    let mut bytes = Vec::with_capacity(file_size as usize);
                    bytes.resize(file_size as usize, 0);

                    f.read_exact(&mut bytes)?;

                    bytes
                },
            });
        }

        // Q: why +0x130? what is the data here?
        f.seek(SeekFrom::Start(songs_start as u64 + 0x130))?;

        loop {
            sbn.songs.push(Song {
                bgm_file: {
                    let value = f.read_u16_be()?;
                    if value == u16::MAX {
                        break;
                    } else {
                        value
                    }
                },
                bk_a_file: f.read_u16_be()?.try_into().ok(),
                bk_b_file: f.read_u16_be()?.try_into().ok(),
                unk_file: f.read_u16_be()?.try_into().ok(),
            });
        }

        Ok(sbn)
    }
}
