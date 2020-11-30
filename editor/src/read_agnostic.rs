use std::io::{prelude::*, Cursor};
use crate::fs::FileTypes;
use crate::bgm::Bgm;
use crate::midi::smf_to_bgm;

pub const FILE_TYPES: FileTypes = FileTypes {
    extensions: ".bin .bgm .mid .midi",
    mime_types: "application/octect-stream application/x-bgm audio/midi audio/midi",
};

#[derive(Debug)]
pub struct Error {}

/*
impl From<io::Error> for Error {
    fn from(io: io::Error) -> Self {
        Self::Io(io)
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
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
*/

pub fn read_agnostic(raw: &[u8]) -> Result<Bgm, Error> {
    let mut cursor = Cursor::new(raw);

    let mut buffer = [0; 4];
    cursor.read_exact(&mut buffer).map_err(|_| Error {})?;

    match &buffer {
        // TODO: nice errors
        b"BGM " => Bgm::from_bytes(raw).map_err(|_| Error {}),
        b"MThd" => smf_to_bgm(raw).map_err(|_| Error {}),
        _ => Err(Error {}),
    }
}
