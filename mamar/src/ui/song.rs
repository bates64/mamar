use std::error::Error;
use std::fs::File;
use std::io::prelude::*;
use std::io::SeekFrom;
use std::path::PathBuf;

use crate::bgm::*;
use crate::midi;
use crate::ui::*;

#[derive(Debug, Clone, PartialEq)]
pub struct Song {
    pub path: PathBuf,
    pub bgm: Bgm,

    adjust: Option<AdjustState>,
    scroll_pos: Vector2D,
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
            scroll_pos: vec2(0.0, 0.0),
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
        let mut commit = false;

        /*
        let mut layout = layout::Column::new();
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
        */

        // Typical scrolling
        self.scroll_pos += i.now.scroll_delta;

        // Drag middle mouse button to scroll also (especially non-trackpad users)
        if i.now.middle_mouse {
            self.scroll_pos -= i.mouse_pos_delta();
        }

        let (g, c) = self.draw_segment(_delta, i, pos + self.scroll_pos.to_3d(), 0);
        root.add(g);
        commit = commit || c;

        (root, commit)
    }

    pub fn draw_segment(&mut self, _delta: Duration, _i: &Input, pos: Vector3D, segment_idx: usize) -> (EntityGroup, bool) {
        let mut root = EntityGroup::new();
        let mut commit = false;

        const TRACK_HEIGHT: f32 = 100.0;
        const MARGIN: f32 = 2.0;
        const TIME_SCALE: f32 = 0.2;

        if let Some(segment) = &self.bgm.segments[segment_idx] {
            let mut subseg_pos = pos.clone();

            for subsegment in &segment.subsegments {
                if let Subsegment::Tracks { track_list, ..} = subsegment {
                    let mut tracks_pos = subseg_pos.clone();
                    let track_list = self.bgm.track_lists.get(*track_list).unwrap();

                    for track in &track_list.tracks {
                        let playback_time = track.commands.playback_time() as f32;
                        let pitch_range = track.commands.pitch_range();

                        let note_height = TRACK_HEIGHT / (pitch_range.end - pitch_range.start) as f32;

                        let mut bg = shape::rect_origin(playback_time * TIME_SCALE, TRACK_HEIGHT, color::BLACK);
                        bg.translate(tracks_pos);
                        bg.translate(vec3(0.0, 0.0, -1.0));
                        root.add(bg);

                        let mut cmd_pos = tracks_pos.clone();
                        for cmd in track.commands.iter() {
                            match cmd {
                                &Command::Delay(t) => cmd_pos.x += (t as f32) * TIME_SCALE,

                                &Command::Note { pitch, length, .. } => {
                                    let mut rect = shape::rect_origin((length as f32) * TIME_SCALE, note_height, color::GREEN);

                                    rect.translate(cmd_pos);
                                    rect.translate(vec3(0.0, {
                                        // Calculate pitch in terms of % of pitch range
                                        let alpha = (pitch - pitch_range.start) as f32 / pitch_range.end as f32;

                                        alpha * TRACK_HEIGHT
                                    }, 0.0));

                                    root.add(rect);
                                }

                                _ => {}
                            }
                        }

                        tracks_pos.y += TRACK_HEIGHT + MARGIN;
                    }

                    subseg_pos.x = tracks_pos.x + MARGIN;
                }
            }
        }

        (root, commit)
    }
}
