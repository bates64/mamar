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
                    if ui.button(0, &track.name).with_width(300.0).clicked() {
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
            let is_master = editing_index == 0;

            ui.modal(1, true, (700.0, 400.0), |ui| {
                ui.text(0, &track.name);
                ui.pad(1, 20.0);
                ui.text(2, format!("Flags: {:#06X}", track.flags));
                ui.pad(3, 10.0);

                let mut polyphony_amt = 0;

                if !is_master { // Doesn't make sense to set these flags on a track with no notes.
                    ui.hbox(4, |ui| {
                        let mut flag = track.get_flag(track_flags::DRUM_TRACK);
                        ui.toggle_button(0, "Drum track", &mut flag);
                        track.set_flag(track_flags::DRUM_TRACK, flag);

                        let mut flag = track.get_flag(track_flags::LOW_PITCH);
                        ui.toggle_button(1, "Low pitch?", &mut flag);
                        track.set_flag(track_flags::LOW_PITCH, flag);

                        let mut flag = track.get_flag(track_flags::POLYPHONY_1);
                        ui.toggle_button(2, "Polyphony 1", &mut flag);
                        track.set_flag(track_flags::POLYPHONY_1, flag);
                        if flag {
                            polyphony_amt += 1;
                        }

                        let mut flag = track.get_flag(track_flags::POLYPHONY_2);
                        ui.toggle_button(3, "Polyphony 2", &mut flag);
                        track.set_flag(track_flags::POLYPHONY_2, flag);
                        if flag {
                            polyphony_amt += 1;
                        }

                        let mut flag = track.get_flag(track_flags::POLYPHONY_3);
                        ui.toggle_button(4, "Polyphony 3", &mut flag);
                        track.set_flag(track_flags::POLYPHONY_3, flag);
                        if flag {
                            polyphony_amt += 1;
                        }
                    });

                    ui.pad(5, 10.0);
                }

                ui.known_size(6, 300.0, 200.0, |ui| {
                    if polyphony_amt >= 2 {
                        ui.text(0, "Warning: game is liable to crash if many tracks use polyphony.");
                    }
                });

                if ui.button(99, "Close").clicked() {
                    self.editing_index = None;
                }
            });
        }
    }
}
