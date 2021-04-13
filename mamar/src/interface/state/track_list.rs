use pm64::bgm::*;

#[derive(Clone)]
pub struct TrackListInterface {
    /// Index of the track we are editing, if any.
    editing_index: Option<usize>,
}

impl TrackListInterface {
    pub fn new() -> Self {
        TrackListInterface {
            editing_index: None,
        }
    }

    pub fn update(&mut self, ui: &mut imui_glium::UiFrame<'_>, track_list: &mut TrackList) {
        ui.vbox(0, |ui| {
            for (i, track) in track_list.tracks.iter_mut().enumerate() {
                ui.hbox(i as u8, |ui| {
                    if ui.button(0, format!("Track {}", i + 1)).clicked() {
                        self.editing_index = Some(i);
                    }

                    if i == 0 {
                        ui.pad(1, 36.0 * 2.0);
                    } else {
                        ui.toggle_button(3, "S", &mut track.solo).with_width(36.0);
                        ui.toggle_button(4, "M", &mut track.mute).with_width(36.0);
                    }

                    ui.pad(5, 10.0);
                    ui.text(6, format!("Flags: {:#06X}", track.flags)).center_y();
                });
            }
        });

        if let Some(editing_index) = self.editing_index {
            let track = &mut track_list.tracks[editing_index];

            ui.modal(1, true, (500.0, 500.0), |ui| {
                ui.text(0, format!("Track {}", editing_index + 1));
                ui.pad(1, 20.0);
                ui.text(2, format!("Flags: {:#06X}", track.flags));
                ui.pad(3, 10.0);

                ui.hbox(4, |ui| {
                    let mut flag = track.get_flag(track_flags::DRUM_TRACK);
                    ui.toggle_button(0, "Drum track", &mut flag);
                    track.set_flag(track_flags::DRUM_TRACK, flag);

                    let mut flag = track.get_flag(0x2000);
                    ui.toggle_button(1, "0x2000", &mut flag);
                    track.set_flag(0x2000, flag);

                    let mut flag = track.get_flag(0x4000);
                    ui.toggle_button(2, "0x4000", &mut flag);
                    track.set_flag(0x4000, flag);

                    let mut flag = track.get_flag(0x8000);
                    ui.toggle_button(3, "0x8000", &mut flag);
                    track.set_flag(0x8000, flag);
                });

                ui.pad(5, 10.0);
                ui.text(6, "If you figure out what these flags do, please let me know.\nThey seem to have something to do with polyphony.");

                ui.pad(98, 50.0);

                if ui.button(99, "Close").clicked() {
                    self.editing_index = None;
                }
            });
        }
    }
}
