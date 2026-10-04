//! Reading the instruments the game plays music with, and their envelopes, from a ROM's sound bank (SBN).

use serde_derive::{Deserialize, Serialize};
use typescript_type_def::TypeDef;

use crate::bgm::{BankSetIndex, PatchAddress};

/// A sound bank (SBN) as a ROM has it, for looking up the instruments it holds.
pub struct SoundBank {
    data: Vec<u8>,
}

/// One of the envelopes an instrument can play with.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TypeDef)]
pub struct Envelope {
    /// How long a note takes to fade out after it ends, in seconds.
    pub release: f64,
}

/// How long a video frame of the engine's is, which envelope times are multiples of, in seconds.
const FRAME: f64 = 5750.0 / 1e6;

/// The times of the envelope steps whose commands are seconds, rounded down to frames (AuEnvelopeIntervals).
const STEP_SECONDS: [f64; 80] = [
    60.0, 55.0, 50.0, 45.0, 40.0, 35.0, 30.0, 27.5, 25.0, 22.5, 20.0, 19.0, 18.0, 17.0, 16.0, 15.0, 14.0, 13.0, 12.0,
    11.0, 10.0, 9.0, 8.0, 7.0, 6.0, 5.0, 4.5, 4.0, 3.5, 3.0, 2.75, 2.5, 2.25, 2.0, 1.9, 1.8, 1.7, 1.6, 1.5, 1.4, 1.3,
    1.2, 1.1, 1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.375, 0.35, 0.325, 0.3, 0.29,
    0.28, 0.27, 0.26, 0.25, 0.24, 0.23, 0.22, 0.21, 0.2, 0.19, 0.18, 0.17, 0.16, 0.15, 0.14, 0.13, 0.12, 0.11, 0.1,
];

/// The times of the envelope steps after [STEP_SECONDS], which are frames.
const STEP_FRAMES: [f64; 14] = [
    16.0, 14.0, 12.0, 11.0, 10.0, 9.0, 8.0, 7.0, 6.0, 5.0, 4.0, 3.0, 2.0, 1.0,
];

/// The first envelope command that isn't a step, which loops and scales a step's volume, up to [ENV_CMD_END].
const ENV_CMD_FIRST: u8 = 0xFB;
const ENV_CMD_END: u8 = 0xFF;

/// The time an envelope step takes, by the index its command gives, in seconds.
fn step_time(command: u8) -> f64 {
    let index = command as usize;
    if let Some(seconds) = STEP_SECONDS.get(index) {
        (seconds / FRAME).floor() * FRAME
    } else if let Some(frames) = STEP_FRAMES.get(index - STEP_SECONDS.len()) {
        frames * FRAME
    } else {
        0.0
    }
}

/// The bank set number the INIT file's list of banks loads each bank set as, for those it loads.
fn init_bank_set(bank_set: BankSetIndex) -> Option<u8> {
    match bank_set {
        BankSetIndex::Set2 => Some(2),
        BankSetIndex::Music => Some(3),
        BankSetIndex::Set4 => Some(4),
        BankSetIndex::Set5 => Some(5),
        BankSetIndex::Set6 => Some(6),
        _ => None,
    }
}

impl SoundBank {
    pub fn new(data: Vec<u8>) -> Self {
        Self { data }
    }

    // Reads past the end of the bank are 0, as a bank that's cut short has nothing there
    fn u8(&self, at: usize) -> u8 {
        self.data.get(at).copied().unwrap_or(0)
    }

    fn u16(&self, at: usize) -> u16 {
        u16::from_be_bytes([self.u8(at), self.u8(at + 1)])
    }

    fn u32(&self, at: usize) -> u32 {
        u32::from_be_bytes([self.u8(at), self.u8(at + 1), self.u8(at + 2), self.u8(at + 3)])
    }

    fn file_count(&self) -> usize {
        self.u32(0x14) as usize
    }

    /// Where the INIT file is, which lists the bank's banks, songs, and drum kit, or 0 if it has none.
    fn init(&self) -> usize {
        self.u32(0x24) as usize
    }

    /// Where file `index` is.
    fn file(&self, index: usize) -> usize {
        (self.u32(0x40 + index * 8) & 0xFFFFFF) as usize
    }

    /// The name of file `index`, such as "GM03", or None if the bank has no such file.
    pub fn file_name(&self, index: usize) -> Option<String> {
        if index >= self.file_count() {
            return None;
        }
        let file = self.file(index);
        Some((8..12).map(|i| self.u8(file + i) as char).collect())
    }

    /// The index of the file named `name`, or None if the bank has none.
    pub fn file_index_of(&self, name: &str) -> Option<usize> {
        (0..self.file_count()).find(|&index| self.file_name(index).as_deref() == Some(name))
    }

    /// The patches of the drum kit that every song's percussion can play, from the PER file: the drums that pitches
    /// 0x80 to 0xC7 play. The song's own drums follow them.
    pub fn kit_drums(&self) -> Vec<PatchAddress> {
        let init = self.init();
        if init == 0 {
            return Vec::new();
        }
        // The INIT file lists the sound effects, drum kit, and instrument files, in that order
        let extra_files = init + self.u16(init + 0x10) as usize;
        let per_index = self.u16(extra_files + 2) as usize;
        if per_index >= self.file_count() {
            return Vec::new();
        }
        let per = self.file(per_index);
        let size = self.u32(per + 4) as usize;
        (0x10..)
            .step_by(12)
            .take_while(|offset| offset + 12 <= size)
            .map(|offset| {
                let raw_bank = self.u8(per + offset);
                let raw_patch = self.u8(per + offset + 1);
                PatchAddress {
                    bank_set: BankSetIndex::try_from((raw_bank & 0x70) >> 4).unwrap(),
                    bank: raw_patch >> 4,
                    instrument: raw_patch & 0xF,
                    envelope: raw_bank & 3,
                }
            })
            .collect()
    }

    /// Where the instrument `patch` plays is, from the banks the INIT file loads and `aux_banks`, the BK files a song
    /// loads into its aux banks, or None if it isn't in one of those banks.
    pub fn instrument_offset(&self, patch: &PatchAddress, aux_banks: &[String]) -> Option<usize> {
        self.instrument_location(patch, aux_banks)
            .map(|(bk, instrument)| bk + instrument)
    }

    /// Where the BK file of the instrument `patch` plays is, and where the instrument is in it. See
    /// [SoundBank::instrument_offset].
    fn instrument_location(&self, patch: &PatchAddress, aux_banks: &[String]) -> Option<(usize, usize)> {
        let file_index = if patch.bank_set == BankSetIndex::Aux {
            let name = aux_banks.get(patch.bank as usize).filter(|name| !name.is_empty())?;
            self.file_index_of(name)?
        } else {
            let bank_set = init_bank_set(patch.bank_set)?;
            let init = self.init();
            if init == 0 {
                return None;
            }
            let bank_list = init + self.u16(init + 0x08) as usize;
            let end = bank_list + self.u16(init + 0x0A) as usize;
            (bank_list..)
                .step_by(4)
                .take_while(|entry| entry + 4 <= end)
                .map(|entry| (entry, self.u16(entry) as usize))
                .take_while(|&(_, file)| file != 0xFFFF && file < self.file_count())
                .find(|&(entry, _)| self.u8(entry + 2) == patch.bank && self.u8(entry + 3) == bank_set)
                .map(|(_, file)| file)?
        };
        let bk = self.file(file_index);
        let instrument = self.u16(bk + 0x12 + patch.instrument as usize * 2) as usize;
        (instrument != 0).then_some((bk, instrument))
    }

    /// The envelopes the instrument `patch` plays can play with, or None if it isn't in one of the banks it can be in.
    pub fn envelopes(&self, patch: &PatchAddress, aux_banks: &[String]) -> Option<Vec<Envelope>> {
        let (bk, instrument) = self.instrument_location(patch, aux_banks)?;
        // An instrument's envelopes are a count, then the offsets of each one's press and release commands from the
        // count
        let presets = bk + self.u32(bk + instrument + 0x2C) as usize;
        Some(
            (0..self.u8(presets) as usize)
                .map(|i| Envelope {
                    release: self.envelope_time(presets + self.u16(presets + 6 + i * 4) as usize),
                })
                .collect(),
        )
    }

    /// How long the envelope command list at `offset` takes, in seconds, as the time of each of its steps.
    fn envelope_time(&self, offset: usize) -> f64 {
        (offset..self.data.len().saturating_sub(1))
            .step_by(2)
            .map(|i| self.u8(i))
            .take_while(|&command| command != ENV_CMD_END)
            .filter(|&command| command < ENV_CMD_FIRST)
            .map(step_time)
            .sum()
    }
}
