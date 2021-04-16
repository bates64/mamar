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

    ui_state: UiState,
}

#[derive(Clone)]
#[allow(dead_code)]
enum UiState {
    None,

    /// Top-level view of a whole segment ("variation") and its subsegments ("sections").
    Segment {
        segment_idx: usize,
    },

    OldOverview {
        selected_segment_idx: u8,
        track_list_interface: TrackListInterface,
        viewing_seg_list: bool,
        selected_track_subseg_idx: u8,
    },
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
            "*.ron",
            "*.mid",
            "*.midi",
            "*.bin",
        ], "")));

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
        if path.extension().unwrap_or_default() == "ron" {
            bgm = ron::de::from_reader(file)?;
        } else if pm64::bgm::midi::is_midi(&mut file)? {
            let mut buf = Vec::new();
            file.read_to_end(&mut buf)?;
            bgm = pm64::bgm::midi::to_bgm(&buf)?;
        } else {
            bgm = Bgm::decode(&mut file)?;
        }

        Ok(Some(Document {
            bgm,
            path,
            ui_state: UiState::Segment {
                segment_idx: 0,
            },
        }))
    }

    pub fn can_save(&self) -> bool {
        let ext = self.path.extension().unwrap_or_default().to_str().unwrap_or_default();

        match ext {
            "bgm" => true,
            "bin" => true,
            "ron" => true,
            _ => false,
        }
    }

    pub fn save(&self) -> Result<(), Box<dyn Error>> {
        assert!(self.can_save()); // TODO: return Err

        let mut file = File::create(&self.path)?;

        if self.path.extension().unwrap_or_default() == "ron" {
            ron::ser::to_writer_pretty(
                &mut file,
                &self.bgm,
                ron::ser::PrettyConfig::new()
                    .with_indentor("  ".to_string())
                    .with_depth_limit(5),
            )?;
        } else {
            self.bgm.encode(&mut file)?;
        }

        Ok(())
    }

    /// Shows as 'Save As' dialog prompt then saves the document to a file. Must be run on the main thread.
    pub fn save_as(&mut self) -> Result<(), Box<dyn Error>> {
        let current_path = self.path.with_extension("bgm");

        let path = tinyfiledialogs::save_file_dialog_with_filter(
            "Save As",
            current_path.to_str().unwrap_or_default(),
            &["*.bgm", "*.ron"],
            "",
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
        let bgm = &mut self.bgm;

        match &mut self.ui_state {
            UiState::None => {}

            UiState::Segment {
                segment_idx,
            } => {
                ui.vbox("seg", |ui| {
                    ui.hbox("seg selector", |ui| {
                        // TODO: allow dragging of tabs around (e.g. pass a &mut Vec)
                        ui.tabs(
                            "seg tabs",
                            segment_idx,
                            bgm.segments
                                .iter()
                                .enumerate()
                                .map(|(idx, seg)| {
                                    (idx, seg.as_ref().map(|seg| {
                                        format!("{}", seg.name)
                                    }).unwrap_or_else(|| String::from("(no data)")))
                                })
                        );
                    });

                    // View actual segment.
                    let opt_segment = &mut bgm.segments[*segment_idx];
                    let track_lists = &bgm.track_lists;

                    ui.pad("top pad", 16.0);

                    if let Some(segment) = opt_segment {
                        let mut to_delete_segment = false;
                        let mut to_add_subseg = false;

                        ui.vbox(0, |ui| {
                            ui.hbox("toolbar", |ui| {
                                if ui.button("del seg", "Delete variation").with_width(250.0).clicked() {
                                    to_delete_segment = true;
                                }

                                // TODO: add loop
                            });

                            ui.pad("top pad", 30.0);

                            let mut swap = None;
                            let mut delete = None;

                            for (i, subseg) in segment.subsegments.iter().enumerate() {
                                ui.hbox(i, |ui| {
                                    if ui.button("subseg up", "^")
                                        .with_width(32.0)
                                        .with_height(32.0)
                                        .clicked() && i != 0
                                    {
                                        swap = Some((i, i - 1));
                                    }
                                    if ui.button("subseg down", "v")
                                        .with_width(32.0)
                                        .with_height(32.0)
                                        .clicked() && i != segment.subsegments.len() - 1
                                    {
                                        swap = Some((i, i + 1));
                                    }
                                    if ui.button("subseg del", "X")
                                        .with_width(32.0)
                                        .with_height(32.0)
                                        .clicked()
                                    {
                                        delete = Some(i);
                                    }

                                    ui.pad("subseg btn pad", 10.0);

                                    match subseg {
                                        Subsegment::Tracks { track_list, .. } => {
                                            let name = &track_lists[track_list].name;
                                            ui.button("subseg tracks name", name).with_width(400.0);
                                        },
                                        Subsegment::Unknown { flags, .. } => {
                                            let label;

                                            // TODO update the enum in pm64::bgm instead
                                            if *flags == 0x30 {
                                                label = "Loop start";
                                            } else if *flags == 0x50 {
                                                label = "Loop end";
                                            } else {
                                                label = "Unknown";
                                            }

                                            ui.pad("subseg unk pad", 20.0);
                                            ui.text("subseg loop name", label).center_y();
                                        }
                                    }
                                });

                                ui.pad((i, "pad"), 10.0);
                            }

                            if let Some((a, b)) = swap {
                                segment.subsegments.swap(a, b);
                            }

                            if let Some(i) = delete {
                                segment.subsegments.remove(i);
                            }

                            ui.pad("btm pad", 30.0);

                            if ui.button("add subseg", "New section").clicked() {
                                to_add_subseg = true;
                            }
                        });

                        if to_add_subseg {
                            let track_list = bgm.add_track_list(TrackList::default());
                            bgm.segments[*segment_idx].as_mut().unwrap().subsegments.push(Subsegment::Tracks {
                                flags: 0x10,
                                track_list,
                            });
                        } else if to_delete_segment {
                            *opt_segment = None;
                        }
                    } else {
                        // Segment is (no data)
                        if ui.button("new seg", "New variation").with_width(200.0).clicked() {
                            *opt_segment = Some(Segment {
                                name: format!("Variation {}", *segment_idx + 1),
                                subsegments: Default::default(),
                            });
                        }
                    }
                });
            }

            UiState::OldOverview {
                selected_segment_idx,
                track_list_interface,
                viewing_seg_list,
                selected_track_subseg_idx,
            } => {
                ui.vbox(0, |ui| {
                    ui.hbox(0, |ui| {
                        if range_select(
                            ui,
                            0,
                            0..bgm.segments.len() as isize,
                            1,
                            selected_segment_idx,
                            |i| {
                                if let Some(seg) = &bgm.segments[*i as usize] {
                                    seg.name.to_owned()
                                } else {
                                    String::from("(no data)")
                                }
                            },
                        ) {
                            *track_list_interface = TrackListInterface::new();
                        }

                        if ui.button(1, "Edit").clicked() {
                            *viewing_seg_list = true;
                        }

                        if *viewing_seg_list {
                            ui.modal(2, true, (300.0, 300.0), |ui| {
                                ui.text(0, "Song Variations").center_x();
                                ui.pad(1, 30.0);
                                ui.known_size(2, 300.0, 32.0 * bgm.segments.len() as f32, |ui| {
                                    ui.vbox(0, |ui| {
                                        let mut swap = None;

                                        for (i, seg) in bgm.segments.iter().enumerate() {
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
                                                    if i < bgm.segments.len() - 1 {
                                                        swap = Some((i, i + 1));
                                                    }
                                                }
                                            });
                                        }

                                        if let Some((a, b)) = swap {
                                            bgm.segments.swap(a, b);
                                        }
                                    });
                                });
                                ui.pad(3, 50.0);
                                if ui.button(4, "Close").clicked() {
                                    *viewing_seg_list = false;
                                }
                            })
                        }
                    });

                    ui.pad(3, 5.0);

                    if let Some(segment) = bgm.segments[*selected_segment_idx as usize].as_mut() {
                        let track_subsegs: Vec<(&u8, &TrackListId)> = segment.subsegments
                            .iter()
                            .filter_map(|s| match s {
                                Subsegment::Tracks { flags, track_list } => Some((flags, track_list)),
                                Subsegment::Unknown { .. } => None,
                            })
                            .collect();

                        let range = 0..track_subsegs.len() as isize;

                        if !range.contains(&(*selected_track_subseg_idx as isize)) {
                            *selected_track_subseg_idx = 0;
                        }

                        let track_lists = &bgm.track_lists;
                        if range_select(
                            ui,
                            4,
                            range,
                            1,
                            &mut *selected_track_subseg_idx,
                            |v| {
                                let (_, track_list_id) = track_subsegs[*v as usize];
                                let track_list = &track_lists[track_list_id];
                                track_list.name.to_owned()
                            },
                        ) {
                            *track_list_interface = TrackListInterface::new();
                        }

                        ui.pad(7, 10.0);

                        let (flags, track_list_id) = track_subsegs[*selected_track_subseg_idx as usize];
                        let track_list = bgm.track_lists.get_mut(track_list_id).unwrap();
                        let voices = &mut bgm.voices;

                        ui.text(8, format!("Flags: {:08X}", flags));
                        ui.pad(9, 10.0);
                        ui.vbox(10, |ui| {
                            track_list_interface.update(ui, track_list, voices);
                        });
                    }
                });
            }
        }
    }
}
