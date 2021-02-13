use std::error::Error;
use std::path::PathBuf;
use std::io::prelude::*;
use std::io::SeekFrom;
use std::fs::File;

use super::*;
use crate::bgm::Bgm;
use crate::util::rw::*;
use crate::midi;

#[derive(Debug)]
pub struct Song {
    pub path: PathBuf,
    pub bgm: Bgm,
}

pub fn is_midi(file: &mut File) -> Result<bool, std::io::Error> {
    file.seek(SeekFrom::Start(0))?;
    Ok(file.read_cstring(4)? == "MThd")
}

impl Song {
    pub fn file_name(&self) -> String {
        match self.path.file_name() {
            Some(name) => name.to_string_lossy().to_string(),
            None => "song.bgm".to_string(),
        }
    }

    pub fn open(path: PathBuf) -> Result<Self, Box<dyn Error>> {
        let file = &mut File::open(&path)?;

        let bgm = {
            if is_midi(file).unwrap_or(false) {
                let mut buf = Vec::new();
                file.seek(SeekFrom::Start(0))?;
                file.read_to_end(&mut buf)?;

                midi::to_bgm(&buf)?
            } else {
                Bgm::decode(file)?
            }
        };

        log::debug!("{}", {
            let mut s = String::new();
            bgm.write_kdl(&mut s).unwrap();
            s
        });

        Ok(Self {
            bgm,
            path,
        })
    }

    pub fn draw(&mut self, ctx: &mut Ctx, _delta: f32) {
        let mut y = 100.0;

        for voice in self.bgm.voices.iter_mut() {
            let btn = btn::primary(
                ctx,
                rect(0.0, y, 96.0, 32.0),
                &format!("Vol {}", voice.volume),
            );
            btn.draw(ctx);
            if btn.is_click(ctx, MouseButton::Left) {
                voice.volume = match voice.volume {
                    0 => 100,
                    _ => 0,
                };
            }

            y += 40.0;
        }
    }
}
