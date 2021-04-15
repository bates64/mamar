use pm64::bgm::*;

use crate::interface::form::range_select;

#[derive(Clone)]
pub struct TrackListInterface {
    /// Index of the track we are editing, if any.
    editing_index: Option<usize>,

    is_edit_voice: bool,
    is_set_instrument: bool,
}

impl TrackListInterface {
    pub fn new() -> Self {
        TrackListInterface {
            editing_index: None,
            is_edit_voice: false,
            is_set_instrument: false,
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

                    if ui.button(6, "Edit Voice...").clicked() {
                        self.is_edit_voice = true;
                        self.is_set_instrument = false;
                    }

                    if self.is_edit_voice {
                        ui.modal(7, true, (600.0, 700.0), |ui| {
                            ui.text(0, format!("Voice of '{}'", track.name));
                            ui.pad(1, 20.0);

                            let mut voice = None;
                            let overrides: Vec<(usize, &Command)> = track.commands
                                .iter()
                                .enumerate()
                                .filter(|(_, cmd)| match cmd {
                                    Command::TrackOverridePatch { .. } => true,
                                    // TODO: add reverby stuff
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
                                .collect();

                            if let Some(voice) = voice {
                                ui.known_size(2, 480.0, 400.0, |ui| {
                                    self.voice_ui(ui, &mut voices[*voice as usize]);
                                });
                            } else {
                                ui.text(3, "This track does not use the voice system.");
                                // TODO: button to add a voice for it
                            }

                            if !overrides.is_empty() {
                                ui.pad(4, 10.0);
                                ui.text(5, "This track has commands which override its voice:");
                                ui.hbox(6, |ui| {
                                    let mut i = 0;
                                    for (_, cmd) in &overrides {
                                        match cmd {
                                            Command::TrackOverridePatch { bank, patch } => {
                                                ui.text(i, format!("bank={:#04X} patch={:#04X}", bank, patch));
                                                i += 1;
                                                ui.pad(i, 10.0);
                                                i += 1;
                                            }
                                            _ => {}
                                        }
                                    }
                                });
                                ui.pad(7, 10.0);
                                if ui.button(8, "Remove voice overrides").with_width(200.0).clicked() {
                                    let mut to_delete = Vec::with_capacity(overrides.len());
                                    for (idx, _) in &overrides {
                                        to_delete.push(*idx);
                                    }
                                    for idx in to_delete {
                                        track.commands.clear_command(idx);
                                    }
                                }
                                ui.pad(9, 20.0);
                            }

                            if ui.button(99, "Close").clicked() {
                                self.is_edit_voice = false;
                                self.is_set_instrument = false;
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
        use pm64::bgm::voice::*;

        // The bank u8 is split into two nibbles: "bank" and "staccatoness" (awful names, I know).
        let mut bank_upper = voice.bank >> 4; // TODO: range 0..=6?
        let mut bank_lower = voice.bank & 0xF;

        ui.vbox(0, |ui| {
            ui.hbox(0, |ui| {
                if ui.button(0, "Set instrument...").with_width(210.0).clicked() {
                    self.is_set_instrument = true;
                }

                ui.pad(1, 20.0);

                if let Some(name) = INSTRUMENTS_BY_ID.get(&(bank_upper, voice.patch)) {
                    ui.text(2, *name).center_y();
                }
            });

            if self.is_set_instrument {
                ui.modal(1, true, (600.0, 500.0), |ui| {
                    ui.hbox(0, |ui| {
                        let mut i = 0; // TODO wider imui keys
                        for (name, (instr_bank_upper, patch)) in INSTRUMENTS_BY_NAME.iter() {
                            let approx_width = name.len() as f32 * 10.0; // XXX

                            if ui.button(i, *name).with_width(approx_width).clicked() {
                                bank_upper = *instr_bank_upper;
                                voice.patch = *patch;
                                self.is_set_instrument = false;
                            }
                            i += 1;
                        }
                    });
                });
            }

            ui.pad(2, 10.0);

            range_select(ui, 3, 0..=255, 1, &mut bank_upper, |v| format!("Bank {}", v));
            range_select(ui, 4, 0..=255, 1, &mut voice.patch, |v| format!("Patch {:#04X}", v));

            range_select(ui, 5, 0..=3, 1, &mut bank_lower, |v| {
                match *v {
                    0 => "Staccato: no".to_string(),
                    _ => format!("Staccato: {}", v),
                }
            });
            range_select(ui, 6, 0..=255, 1, &mut voice.volume, |v| format!("Volume {}", v));
            range_select(ui, 7, -128..=127, 1, &mut voice.pan, |v| {
                let a = v.abs();
                format!("Pan {} ({})", v, if a > 64 { "right" } else if a == 64 { "middle" } else { "left" })
            });
            range_select(ui, 8, 0..=255, 1, &mut voice.reverb, |v| format!("Reverb {}", v));
            range_select(ui, 9, 0..=255, 1, &mut voice.coarse_tune, |v| format!("Coarse tune {}", v));
            range_select(ui, 10, 0..=255, 1, &mut voice.fine_tune, |v| format!("Fine tune {}", v));
        });

        voice.bank = (bank_upper << 4) | bank_lower;
    }
}
