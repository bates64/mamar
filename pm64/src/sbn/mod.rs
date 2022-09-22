use std::num::NonZeroU16;

use serde_derive::{Serialize, Deserialize};
use typescript_type_def::TypeDef;

use crate::bgm::{self, Bgm};
use crate::rw::*;

pub mod de;
pub mod en;

pub const MAGIC: &str = "SBN ";
pub const SBN_START: u64 = 0xF00000;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TypeDef)]
pub struct Sbn {
    pub files: Vec<File>,
    pub songs: Vec<Song>,
}

#[derive(Debug, Clone, PartialEq, Eq,  Serialize, Deserialize, TypeDef)]
pub struct File {
    pub name: String,
    pub data: Vec<u8>,
}

impl File {
    pub fn magic(&self) -> std::io::Result<String> {
        let mut cursor = std::io::Cursor::new(&self.data);
        cursor.read_cstring(4)
    }

    pub fn as_bgm(&self) -> Result<Bgm, bgm::de::Error> {
        Bgm::from_bytes(&self.data)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TypeDef)]
pub struct Song {
    pub bgm_file: u16,

    // Q: are these actually BK file indexes or are they just some other kind of data?
    pub bk_a_file: Option<NonZeroU16>,
    pub bk_b_file: Option<NonZeroU16>,

    /// Always None in original ROM.
    pub unk_file: Option<NonZeroU16>,
}
