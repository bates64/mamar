use std::io::{self, prelude::*, SeekFrom};
use log::warn;
use super::*;
use crate::rw_util::*;

type Error = io::Error;

type Result<T> = std::result::Result<T, Error>;

impl Sbn {
    pub fn as_bytes(&self) -> Result<Vec<u8>> {
        let mut encoded = io::Cursor::new(Vec::new());
        self.encode(&mut encoded)?;
        Ok(encoded.into_inner())
    }

    pub fn encode<W: Write + Seek>(&self, f: &mut W) -> Result<()> {
        todo!("SBN encoding") // TODO
    }
}
