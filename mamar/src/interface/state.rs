mod track_list;

use std::{error::Error, io::Read};
use std::path::PathBuf;
use std::fs::File;

use pm64::bgm::*;

use track_list::TrackListInterface;
use crate::interface::form::range_select;

#[derive(Default, PartialEq, Clone)]
pub struct State {
    pub document: Option<Document>,
}

#[derive(Clone)]
pub struct Document {
    pub bgm: Bgm,
    pub path: PathBuf,

    selected_segment_idx: u8,
    selected_track_subseg_idx: u8,

    viewing_seg_list: bool,

    track_list_interface: TrackListInterface,
}

// Change of anything other than self.bgm should not be considered a History-changing action.
impl PartialEq for Document {
    fn eq(&self, other: &Self) -> bool {
        self.bgm == other.bgm
    }
}

impl Document {
    /// Prompt an 'Open File' dialog to open a document. Must be run on the main thread.
    pub fn open_prompt() -> Result<Option<Self>, Box<dyn Error>> {
        let path = tinyfiledialogs::open_file_dialog("Open File", "", Some((&[
            "*.bgm",
            "*.mid",
            "*.midi",
            "*.bin",
        ], "BGM and MIDI files")));

        if let Some(path) = path {
            let path = PathBuf::from(path);
            Self::open_from_path(path)
        } else {
            Ok(None)
        }
    }

    pub fn open_from_path(path: PathBuf) -> Result<Option<Self>, Box<dyn Error>> {
        let mut file = File::open(&path)?;

        let bgm;
        if pm64::bgm::midi::is_midi(&mut file)? {
            let mut buf = Vec::new();
            file.read_to_end(&mut buf)?;
            bgm = pm64::bgm::midi::to_bgm(&buf)?;
        } else {
            bgm = Bgm::decode(&mut file)?;
        }

        Ok(Some(Document {
            bgm,
            path,
            selected_segment_idx: 0,
            selected_track_subseg_idx: 0,
            viewing_seg_list: false,
            track_list_interface: TrackListInterface::new(),
        }))
    }

    pub fn can_save(&self) -> bool {
        let ext = self.path.extension().unwrap_or_default().to_str().unwrap_or_default();

        match ext {
            "bgm" => true,
            "bin" => true,
            _ => false,
        }
    }

    pub fn save(&self) -> Result<(), Box<dyn Error>> {
        assert!(self.can_save()); // TODO: return Err

        let mut file = File::create(&self.path)?;
        self.bgm.encode(&mut file)?;

        Ok(())
    }

    /// Shows as 'Save As' dialog prompt then saves the document to a file. Must be run on the main thread.
    pub fn save_as(&mut self) -> Result<(), Box<dyn Error>> {
        let current_path = self.path.with_extension("bgm");

        let path = tinyfiledialogs::save_file_dialog_with_filter(
            "Save As",
            current_path.to_str().unwrap_or_default(),
            &["*.bgm"],
            "BGM",
        );

        if let Some(path) = path {
            let mut path = PathBuf::from(path);

            if path.extension().is_none() {
                path.set_extension("bgm");
            }

            std::mem::swap(&mut self.path, &mut path);
            let prev_path = path;

            if self.can_save() {
                self.save()
            } else {
                self.path = prev_path;
                // TODO: probably error
                Ok(())
            }
        } else {
            Ok(())
        }
    }

    pub fn update(&mut self, ui: &mut imui_glium::UiFrame<'_>) {
        ui.vbox(0, |ui| {
            ui.hbox(0, |ui| {
                let segments = &self.bgm.segments;
                if range_select(
                    ui,
                    0,
                    0..self.bgm.segments.len() as isize,
                    1,
                    &mut self.selected_segment_idx,
                    |i| {
                        if let Some(seg) = &segments[*i as usize] {
                            seg.name.to_owned()
                        } else {
                            String::from("(no data)")
                        }
                    },
                ) {
                    self.track_list_interface = TrackListInterface::new();
                }

                if ui.button(1, "Edit").clicked() {
                    self.viewing_seg_list = true;
                }

                if self.viewing_seg_list {
                    ui.modal(2, true, (300.0, 300.0), |ui| {
                        ui.text(0, "Song Variations").center_x();
                        ui.pad(1, 30.0);
                        ui.known_size(2, 300.0, 32.0 * self.bgm.segments.len() as f32, |ui| {
                            ui.vbox(0, |ui| {
                                let mut swap = None;

                                for (i, seg) in self.bgm.segments.iter().enumerate() {
                                    ui.hbox(i as u8, |ui| {
                                        ui.known_size(0, 220.0, 32.0,|ui| {
                                            ui.text(0, if let Some(seg) = seg {
                                                &seg.name
                                            } else {
                                                "(no data)"
                                            }).center_y();
                                        });

                                        if ui.button(1, "^").with_width(32.0).clicked() {
                                            if i > 0 {
                                                swap = Some((i, i - 1));
                                            }
                                        }
                                        if ui.button(2, "v").with_width(32.0).clicked() {
                                            if i < self.bgm.segments.len() - 1 {
                                                swap = Some((i, i + 1));
                                            }
                                        }
                                    });
                                }

                                if let Some((a, b)) = swap {
                                    self.bgm.segments.swap(a, b);
                                }
                            });
                        });
                        ui.pad(3, 50.0);
                        if ui.button(4, "Close").clicked() {
                            self.viewing_seg_list = false;
                        }
                    })
                }
            });

            ui.pad(3, 5.0);

            if let Some(segment) = self.bgm.segments[self.selected_segment_idx as usize].as_mut() {
                let track_subsegs: Vec<(&u8, &TrackListId)> = segment.subsegments
                    .iter()
                    .filter_map(|s| match s {
                        Subsegment::Tracks { flags, track_list } => Some((flags, track_list)),
                        Subsegment::Unknown { .. } => None,
                    })
                    .collect();

                let range = 0..track_subsegs.len() as isize;

                if !range.contains(&(self.selected_track_subseg_idx as isize)) {
                    self.selected_track_subseg_idx = 0;
                }

                let track_lists = &self.bgm.track_lists;
                if range_select(
                    ui,
                    4,
                    range,
                    1,
                    &mut self.selected_track_subseg_idx,
                    |v| {
                        let (_, track_list_id) = track_subsegs[*v as usize];
                        let track_list = &track_lists[track_list_id];
                        track_list.name.to_owned()
                    },
                ) {
                    self.track_list_interface = TrackListInterface::new();
                }

                ui.pad(7, 10.0);

                let (flags, track_list_id) = track_subsegs[self.selected_track_subseg_idx as usize];
                let track_list = self.bgm.track_lists.get_mut(track_list_id).unwrap();
                let track_list_interface = &mut self.track_list_interface;
                let voices = &mut self.bgm.voices;

                ui.text(8, format!("Flags: {:08X}", flags));
                ui.pad(9, 10.0);
                ui.vbox(10, |ui| {
                    track_list_interface.update(ui, track_list, voices);
                });
            }
        });
    }
}
