use std::path::PathBuf;
use std::error::Error;
use crate::bgm::Bgm;
use super::*;

#[derive(Debug)]
pub struct Song {
    pub path: PathBuf,
    pub bgm: Bgm,

    voice_btns: [btn::ButtonState; 16],
}

impl Song {
    pub fn open(path: PathBuf) -> Result<Self, Box<dyn Error>> {
        use std::fs::File;

        Ok(Self {
            bgm: Bgm::decode(&mut File::open(&path)?)?,
            path,

            voice_btns: Default::default(),
        })
    }

    pub fn draw(&mut self, ctx: &mut Ctx, delta: f32) {
        let mut y = 100.0;

        for (voice, btn_state) in self.bgm.voices.iter_mut().zip(self.voice_btns.iter_mut()) {
            if btn::primary(ctx, delta, rect(0.0, y, 96.0, 32.0), &format!("Vol {}", voice.volume), btn_state) {
                voice.volume = match voice.volume {
                    0 => 100,
                    _ => 0,
                };
            }

            y += 40.0;
        }
    }
}
