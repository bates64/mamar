use pm64::bgm::*;

use crate::interface::form::range_select;

#[derive(Clone)]
pub struct TrackListInterface {
    /// Index of the track we are editing, if any.
    editing_index: Option<usize>,

    is_changing_instrument: bool,
}

impl TrackListInterface {
    pub fn new() -> Self {
        TrackListInterface {
            editing_index: None,
            is_changing_instrument: false,
        }
    }

    pub fn update(&mut self, ui: &mut imui_glium::UiFrame<'_>, track_list: &mut TrackList, voices: &mut [Voice]) {
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

            ui.modal(1, true, (600.0, 300.0), |ui| {
                ui.text(0, &track.name);
                ui.pad(1, 20.0);
                ui.text(2, format!("Flags: {:#06X}", track.flags));
                ui.pad(3, 10.0);

                let mut polyphony_amt = 0;

                if !is_master {
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

                    ui.pad(5, 20.0);

                    if ui.button(6, "Edit Voice").clicked() {
                        self.is_changing_instrument = true;
                    }

                    if self.is_changing_instrument {
                        ui.modal(7, true, (600.0, 500.0), |ui| {
                            ui.text(0, format!("Voice of '{}'", track.name));
                            ui.pad(1, 20.0);

                            let mut voice = None;
                            let overrides: Vec<usize> = track.commands
                                .iter()
                                .enumerate()
                                .filter(|(_, cmd)| match cmd {
                                    Command::TrackOverridePatch { .. } => true,
                                    Command::TrackVoice(a) => {
                                        match voice {
                                            Some(b) if a == b => false, // Same as current voice
                                            Some(_) => true, // Voice change D:
                                            None => {
                                                // We've learned what voice index this track uses!
                                                voice = Some(a);
                                                false
                                            }
                                        }
                                    }
                                    _ => false,
                                })
                                .map(|(idx, _)| idx)
                                .collect();

                            if let Some(voice) = voice {
                                ui.known_size(2, 300.0, 300.0, |ui| {
                                    self.voice_ui(ui, &mut voices[*voice as usize]);
                                });
                            } else {
                                ui.text(3, "This track does not use the voice system.");
                                // TODO: button to add a voice for it
                            }

                            if !overrides.is_empty() {
                                ui.pad(4, 10.0);
                                ui.text(5, "This track has commands which override its voice.");
                                ui.pad(6, 10.0);
                                if ui.button(7, "Remove voice overrides").with_width(200.0).clicked() {
                                    for idx in overrides {
                                        track.commands.clear_command(idx)
                                    }
                                }
                                ui.pad(8, 20.0);
                            }

                            if ui.button(99, "Close").clicked() {
                                self.is_changing_instrument = false;
                            }
                        });
                    }
                }

                ui.known_size(8, 300.0, 64.0, |ui| {
                    if polyphony_amt >= 2 {
                        ui.text(0, "Warning: game is likely to crash if many tracks use polyphony.")
                            .center_y();
                    }
                });

                if ui.button(99, "Close").clicked() {
                    self.editing_index = None;
                }
            });
        }
    }

    pub fn voice_ui(&mut self, ui: &mut imui_glium::UiFrame<'_>, voice: &mut Voice) {
        ui.vbox(0, |ui| {
            range_select(ui, 0, 0..=255, 1, &mut voice.bank, |v| format!("Bank {:#04X}", v));
            range_select(ui, 1, 0..=255, 1, &mut voice.patch, |v| format!("Patch {:#04X}", v));
            range_select(ui, 2, 0..=255, 1, &mut voice.volume, |v| format!("Volume {}", v));
            range_select(ui, 3, -128..127, 1, &mut voice.pan, |v| format!("Pan {}", v));
            range_select(ui, 4, 0..=255, 1, &mut voice.reverb, |v| format!("Reverb {}", v));
            range_select(ui, 5, 0..=255, 1, &mut voice.coarse_tune, |v| format!("Coarse tune {}", v));
            range_select(ui, 6, 0..=255, 1, &mut voice.fine_tune, |v| format!("Fine tune {}", v));
        });
    }
}
