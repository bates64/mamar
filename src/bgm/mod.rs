use std::fmt;
use std::ops::{Deref, Range};
use std::rc::Rc;

use id_arena::{Arena, Id};

/// Encoder ([Bgm] -> .bin)
pub mod en;

/// Decoder (.bin -> [Bgm])
pub mod de;

mod cmd;
pub use cmd::*;

/// Constant signature string which appears at the start of every binary BGM file.
pub const MAGIC: &str = "BGM ";

/// An offset relative to the beginning of the decoded/encoded BGM.
pub type FilePos = u64;

#[derive(Clone, Default, Debug)]
pub struct Bgm {
    /// ASCII song index.
    pub index: String,

    pub track_lists: Arena<TrackList>,

    pub segments: [Option<Segment>; 4],

    pub drums: Vec<Drum>,
    pub voices: Vec<Voice>,

    pub unknowns: Vec<Unknown>,
}

#[derive(Clone, Default, Copy, PartialEq, Eq, Debug)]
pub struct NoSpace;

impl Bgm {
    pub fn new() -> Bgm {
        Default::default()
    }

    pub fn can_add_segment(&self) -> bool {
        self.segments.iter().any(|s| s.is_none())
    }

    pub fn add_segment(&mut self) -> Result<&mut Segment, NoSpace> {
        let empty_seg: Option<&mut Option<Segment>> = self.segments.iter_mut().find(|s| s.is_none());

        match empty_seg {
            None => Err(NoSpace),
            Some(slot) => {
                *slot = Some(Segment::default());
                Ok(slot.as_mut().unwrap())
            }
        }
    }

    pub fn find_track_list_with_pos(&self, pos: FilePos) -> Option<Id<TrackList>> {
        for (id, track_list) in self.track_lists.iter() {
            if track_list.pos == Some(pos) {
                return Some(id);
            }
        }

        None
    }
}

#[derive(Clone, PartialEq, Eq, Debug, Default)]
pub struct Segment {
    pub subsegments: Vec<Subsegment>,
}

// TODO: better representation for `flags`
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum Subsegment {
    Tracks {
        flags: u8,
        track_list: Id<TrackList>,
    },
    Unknown {
        flags: u8,
        data: [u8; 3], // Is this always padding?
    },
}

#[derive(Clone, Default, PartialEq, Eq, Debug)]
pub struct TrackList {
    pub pos: Option<FilePos>,
    pub tracks: [Track; 16],
}

#[derive(Clone, Default, PartialEq, Eq, Debug)]
pub struct Track {
    pub flags: u16, // TODO: better representation
    pub commands: CommandSeq,
}

impl Subsegment {
    pub fn flags(&self) -> u8 {
        match *self {
            Subsegment::Tracks { flags, .. } => flags,
            Subsegment::Unknown { flags, .. } => flags,
        }
    }
}

#[derive(Clone, Default, PartialEq, Eq, Debug)]
pub struct Drum {
    pub bank: u8,
    pub patch: u8,
    pub coarse_tune: u8,
    pub fine_tune: u8,
    pub volume: u8,
    pub pan: u8,
    pub reverb: u8,
    pub unk_07: u8,

    // The following are possibly just padding, or they just have unused uses. Needs testing
    pub unk_08: u8, // Unused; zero in all original songs
    pub unk_09: u8, // Unused
    pub unk_0a: u8, // Unused
    pub unk_0b: u8, // Unused
}

#[derive(Clone, Default, PartialEq, Eq, Debug)]
pub struct Voice {
    pub bank: u8,
    pub patch: u8,
    pub volume: u8,
    pub pan: u8,
    pub reverb: u8,
    pub coarse_tune: u8,
    pub fine_tune: u8,
    pub unk_07: u8,
}

#[derive(Clone, PartialEq, Eq, Debug, Default)]
pub struct Unknown {
    pub range: Range<u64>,
    pub data: Vec<u8>,
}

#[derive(Clone, Default, PartialEq, Eq, Debug)]
pub struct TaggedRc<T> {
    /// The original file position T was decoded from.
    pub decoded_pos: Option<u64>,
    pub rc: Rc<T>,
}

impl<T> Deref for TaggedRc<T> {
    type Target = Rc<T>;

    fn deref(&self) -> &Self::Target {
        &self.rc
    }
}

impl Bgm {
    pub fn write_kdl<W: fmt::Write>(&self, f: &mut W) -> Result<(), fmt::Error> {
        writeln!(f, "index {:?}", self.index)?;
        writeln!(f)?;
        writeln!(f, "voices {{")?;
        for voice in &self.voices {
            writeln!(
                f,
                "    voice bank={:#X} patch={:#X} coarse_tune={} fine_tune={} volume={} pan={} reverb={}",
                voice.bank, voice.patch, voice.coarse_tune, voice.fine_tune, voice.volume, voice.pan, voice.reverb
            )?;
        }
        writeln!(f, "}}")?;
        writeln!(f)?;
        writeln!(f, "drums {{")?;
        for drum in &self.drums {
            writeln!(
                f,
                "    drum bank={:#X} patch={:#X} coarse_tune={} fine_tune={} volume={} pan={} reverb={}",
                drum.bank, drum.patch, drum.coarse_tune, drum.fine_tune, drum.volume, drum.pan, drum.reverb
            )?;
        }
        writeln!(f, "}}")?;
        writeln!(f)?;
        for segment in &self.segments {
            if let Some(subsegment) = segment {
                writeln!(f, "segment {{")?;
                for subsegment in &subsegment.subsegments {
                    match subsegment {
                        Subsegment::Tracks { flags, track_list } => {
                            let track_list = &self.track_lists[*track_list];

                            if let Some(offset) = track_list.pos {
                                writeln!(f, "    // offset {:#X}", offset)?;
                            }
                            writeln!(f, "    tracks flags={:#X} {{", flags)?;
                            for track in track_list.tracks.iter() {
                                if !track.commands.is_empty() {
                                    writeln!(f, "        track flags={:#X} {{", track.flags)?;
                                    for command in track.commands.iter() {
                                        match command {
                                            Command::Delay(t) => writeln!(f, "            delay {}", t)?,
                                            Command::Note {
                                                pitch,
                                                velocity,
                                                length,
                                                flag,
                                            } => {
                                                write!(f, "            note {} {} {}", pitch, velocity, length)?;
                                                if *flag {
                                                    write!(f, " flag=true")?;
                                                }
                                                writeln!(f)?;
                                            }
                                            Command::MasterTempo(bpm) => writeln!(f, "            set_tempo {}", bpm)?,
                                            Command::MasterTempoFade { time, bpm } => {
                                                writeln!(f, "            fade_tempo {} {}", bpm, time)?
                                            }
                                            Command::MasterVolume(vol) => {
                                                writeln!(f, "            set_master_volume {}", vol)?
                                            }
                                            Command::MasterVolumeFade { time, volume } => {
                                                writeln!(f, "            fade_master_volume {} {}", volume, time)?
                                            }
                                            Command::SubTrackVolume(vol) => {
                                                writeln!(f, "            set_volume {}", vol)?
                                            }
                                            Command::SegTrackVolume(vol) => {
                                                writeln!(f, "            set_volume_longterm {}", vol)?
                                            }
                                            Command::TrackVolumeFade { time, volume } => {
                                                writeln!(f, "            fade_volume {} {}", volume, time)?
                                            }
                                            Command::MasterTranspose(t) => writeln!(f, "            transpose {}", t)?,
                                            Command::MasterEffect(a, b) => writeln!(f, "            effect {} {}", a, b)?,
                                            Command::TrackOverridePatch { bank, patch } => {
                                                writeln!(f, "            override_bank_patch {} {}", bank, patch)?
                                            }
                                            Command::SubTrackPan(pan) => writeln!(f, "            set_pan {}", pan)?,
                                            Command::SubTrackReverb(r) => writeln!(f, "            set_reverb {}", r)?,
                                            Command::SubTrackReverbType(ty) => {
                                                writeln!(f, "            set_reverb_type {}", ty)?
                                            }
                                            Command::SubTrackCoarseTune(coarse) => {
                                                writeln!(f, "            set_tune coarse={}", coarse)?
                                            }
                                            Command::SubTrackFineTune(fine) => {
                                                writeln!(f, "            set_tune fine={}", fine)?
                                            }
                                            Command::SegTrackTune { coarse, fine } => {
                                                writeln!(f, "            set_tune coarse={} fine={}", coarse, fine)?
                                            }
                                            Command::TrackTremolo { amount, speed, unknown } => {
                                                writeln!(f, "            tremolo {} {} {}", amount, speed, unknown)?
                                            }
                                            Command::TrackTremoloStop => writeln!(f, "            end_tremolo")?,
                                            Command::TrackVoice(v) => writeln!(f, "            set_voice {}", v)?,
                                            Command::Marker(id) => writeln!(f, "            marker {:?}", id)?,
                                            Command::Subroutine(range) => {
                                                writeln!(
                                                    f,
                                                    "            subroutine {:?} start={:?} end={:?}",
                                                    range.name, range.start, range.end
                                                )?;
                                            }
                                            Command::Unknown(data) => {
                                                write!(f, "            raw")?;
                                                for byte in data {
                                                    write!(f, " {:#02X}", byte)?;
                                                }
                                                writeln!(f)?;
                                            }
                                            Command::End => writeln!(f, "            end_track")?,
                                        }
                                    }
                                    writeln!(f, "        }}")?;
                                } else {
                                    writeln!(f, "        track flags={:#X}", track.flags)?;
                                }
                            }
                            writeln!(f, "    }}")?;
                        }
                        Subsegment::Unknown { flags, data } => {
                            if data[0] == 0 && data[1] == 0 && data[2] == 0 {
                                writeln!(f, "    unknown flags={:#X}", flags)?;
                            } else {
                                writeln!(f, "    unknown flags={:#X} {{", flags)?;
                                writeln!(f, "        data {:#02X}", data[0])?;
                                writeln!(f, "        data {:#02X}", data[1])?;
                                writeln!(f, "        data {:#02X}", data[2])?;
                                writeln!(f, "    }}")?;
                            }
                        }
                    }
                }
                writeln!(f, "}}")?;
            } else {
                writeln!(f, "segment")?;
            }
        }

        Ok(())
    }

    pub fn as_kdl(&self) -> Result<String, fmt::Error> {
        let mut s = String::with_capacity(128);
        self.write_kdl(&mut s)?;
        Ok(s)
    }
}
