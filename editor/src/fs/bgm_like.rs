use std::io::{self, prelude::*, Cursor};
use std::fmt;
use pmbgm::{self as bgm, Bgm};
use super::file::FileTypes;
use crate::midi;

pub const FILE_TYPES: FileTypes = FileTypes {
    extensions: ".bgm .bin .mid .midi",
    mime_types: "application/x-bgm application/octect-stream audio/midi audio/midi",
};

#[derive(Debug)]
pub enum Error {
    UnsupportedFileType,
    Bgm(bgm::de::Error),
    Smf(midi::smf_to_bgm::Error),
    Io(io::Error),
}

impl From<bgm::de::Error> for Error {
    fn from(source: bgm::de::Error) -> Self {
        Self::Bgm(source)
    }
}

impl From<midi::smf_to_bgm::Error> for Error {
    fn from(source: midi::smf_to_bgm::Error) -> Self {
        Self::Smf(source)
    }
}

impl From<io::Error> for Error {
    fn from(source: io::Error) -> Self {
        Self::Io(source)
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::UnsupportedFileType => write!(f, "unsupported file type (must be BGM or MIDI)"),
            Error::Bgm(source)  => write!(f, "malformed BGM: {}", source),
            Error::Smf(source)  => write!(f, "cannot convert MIDI: {}", source),
            Error::Io(source)   => write!(f, "cannot read file: {}", source),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Error::Bgm(source) => Some(source),
            Error::Smf(source) => Some(source),
            Error::Io(source) => Some(source),
            _ => None,
        }
    }
}

/// Returns `Ok((Bgm, had to convert?))`.
pub fn from_bytes(raw: &[u8]) -> Result<(Bgm, bool), Error> {
    let mut cursor = Cursor::new(raw);

    let mut buffer = [0; 4];
    cursor.read_exact(&mut buffer)?;

    match &buffer {
        b"BGM " => Ok((Bgm::from_bytes(raw)?, false)),
        b"MThd" => Ok((midi::smf_to_bgm(raw)?, true)),
        _       => Err(Error::UnsupportedFileType),
    }
}
