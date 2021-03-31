use std::error::Error;
use std::fs::File;
use std::io::prelude::*;
use std::io::SeekFrom;
use std::path::PathBuf;

use crate::bgm::Bgm;
use crate::midi;
use crate::ui::*;

#[derive(Debug, Clone, PartialEq)]
pub struct Song {
    pub path: PathBuf,
    pub bgm: Bgm,

    adjust: Option<AdjustState>,
}

#[derive(Debug, Clone, PartialEq)]
struct AdjustState {
    entity_id: usize,
    start_y: f32,
    start_value: isize,
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

        /*log::debug!("{}", {
            let mut s = String::new();
            bgm.write_kdl(&mut s).unwrap();
            s
        });*/

        Ok(Self {
            bgm,
            path,
            adjust: None,
        })
    }

    /*
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
    */

    pub fn draw(&mut self, _delta: Duration, i: &Input, pos: Vector3D) -> (EntityGroup, bool) {
        let mut root = EntityGroup::new();
        let mut layout = layout::Column::new();
        let mut commit = false;

        for (idx, voice) in self.bgm.voices.iter_mut().enumerate() {
            root.add({
                let mut button = button(&format!("voice {:X} {:X}", voice.bank, voice.patch), 128.0);

                button.translate(pos);
                layout.apply(&mut button);
                layout.pad(4.0);

                if let Some(mouse_pos) = i.now.mouse_pos {
                    // Click and drag to adjust value
                    let value = &mut voice.patch;
                    if let Some(adjust) = self.adjust.as_mut() {
                        // Something is currently being adjusted, is it us?
                        if adjust.entity_id == idx {
                            // Change the value using the change in mouse Y since the start of the drag
                            let delta = adjust.start_y - mouse_pos.y;
                            let new_value = adjust.start_value.saturating_add((delta / 10.0).round() as isize);
                            *value = new_value as u8;

                            // End drag?
                            if !i.now.left_mouse  {
                                self.adjust = None;
                                commit = true;
                            }
                        }
                    } else {
                        // Begin drag?
                        if i.is_mouse_over(&button.bounding_box()) && i.now.left_mouse && !i.prev.left_mouse {
                            self.adjust = Some(AdjustState {
                                entity_id: idx,
                                start_value: *value as isize,
                                start_y: mouse_pos.y,
                            })
                        }
                    }
                }

                button
            });
        }

        (root, commit)
    }
}
