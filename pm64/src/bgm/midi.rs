use std::error::Error;
use std::io::SeekFrom;
use std::io::prelude::*;

use midly::{MetaMessage, Smf};

use crate::bgm::*;
use crate::id::gen_id;
use crate::rw::*;

pub fn is_midi<R: Read + Seek>(file: &mut R) -> Result<bool, std::io::Error> {
    let previous_pos = file.pos().unwrap_or_default();

    file.seek(SeekFrom::Start(0))?;
    let is_midi = file.read_cstring(4)? == "MThd";

    file.seek(SeekFrom::Start(previous_pos))?;

    Ok(is_midi)
}

pub fn to_bgm(raw: &[u8]) -> Result<Bgm, Box<dyn Error>> {
    let smf = Smf::parse(raw)?;
    let mut bgm = Bgm::new();

    // Timing information (ticks per beat, aka "division"). MIDI files can use what they want, but the game always(?)
    // uses 48 ticks per beat - so we have to convert the MIDI timescale to the BGM timescale.
    let ticks_per_beat = match smf.header.timing {
        midly::Timing::Metrical(tpb) => tpb.as_int() as f32,
        midly::Timing::Timecode(fps, subframe) => 1.0 / fps.as_f32() / subframe as f32, // Uncommon, untested
    };
    log::debug!("original ticks/beat: {}", ticks_per_beat);
    let time_divisor = ticks_per_beat / 48.0; // Divide all MIDI times by this value to convert to BGM timescale!

    bgm.name = "New Song".to_string();

    let total_song_length = convert_time(
        {
            let mut max = 0;

            for track in &smf.tracks {
                let mut length = 0;

                for event in track {
                    length += event.delta.as_int() as usize;
                }

                if length > max {
                    max = length;
                }
            }

            max
        },
        time_divisor,
    );

    log::debug!("song length: {} ticks (48 ticks/beat)", total_song_length);

    let track_list = TrackList {
        pos: None,
        tracks: [
            midi_track_to_bgm_track(
                smf.tracks.first(),
                total_song_length,
                0,
                time_divisor,
                &mut bgm.instruments,
            ),
            midi_track_to_bgm_track(
                smf.tracks.get(1),
                total_song_length,
                1,
                time_divisor,
                &mut bgm.instruments,
            ),
            midi_track_to_bgm_track(
                smf.tracks.get(2),
                total_song_length,
                2,
                time_divisor,
                &mut bgm.instruments,
            ),
            midi_track_to_bgm_track(
                smf.tracks.get(3),
                total_song_length,
                3,
                time_divisor,
                &mut bgm.instruments,
            ),
            midi_track_to_bgm_track(
                smf.tracks.get(4),
                total_song_length,
                4,
                time_divisor,
                &mut bgm.instruments,
            ),
            midi_track_to_bgm_track(
                smf.tracks.get(5),
                total_song_length,
                5,
                time_divisor,
                &mut bgm.instruments,
            ),
            midi_track_to_bgm_track(
                smf.tracks.get(6),
                total_song_length,
                6,
                time_divisor,
                &mut bgm.instruments,
            ),
            midi_track_to_bgm_track(
                smf.tracks.get(7),
                total_song_length,
                7,
                time_divisor,
                &mut bgm.instruments,
            ),
            midi_track_to_bgm_track(
                smf.tracks.get(8),
                total_song_length,
                8,
                time_divisor,
                &mut bgm.instruments,
            ),
            midi_track_to_bgm_track(
                smf.tracks.get(9),
                total_song_length,
                9,
                time_divisor,
                &mut bgm.instruments,
            ),
            midi_track_to_bgm_track(
                smf.tracks.get(10),
                total_song_length,
                10,
                time_divisor,
                &mut bgm.instruments,
            ),
            midi_track_to_bgm_track(
                smf.tracks.get(11),
                total_song_length,
                11,
                time_divisor,
                &mut bgm.instruments,
            ),
            midi_track_to_bgm_track(
                smf.tracks.get(12),
                total_song_length,
                12,
                time_divisor,
                &mut bgm.instruments,
            ),
            midi_track_to_bgm_track(
                smf.tracks.get(13),
                total_song_length,
                13,
                time_divisor,
                &mut bgm.instruments,
            ),
            midi_track_to_bgm_track(
                smf.tracks.get(14),
                total_song_length,
                14,
                time_divisor,
                &mut bgm.instruments,
            ),
            midi_track_to_bgm_track(
                smf.tracks.get(15),
                total_song_length,
                15,
                time_divisor,
                &mut bgm.instruments,
            ),
        ],
    };
    let track_list_id = bgm.add_track_list(track_list);

    let (_, variation) = bgm.add_variation().unwrap();
    variation.segments = vec![Segment::Subseg {
        id: Some(gen_id()),
        track_list: track_list_id,
    }];

    Ok(bgm)
}

fn midi_track_to_bgm_track(
    events: Option<&Vec<midly::TrackEvent>>,
    total_song_length: usize,
    track_number: usize,
    time_divisor: f32,
    instruments: &mut Vec<Instrument>,
) -> Track {
    use midly::{MidiMessage, TrackEventKind};

    /// NoteOn data
    #[derive(Clone, Copy)]
    struct Note {
        time: usize,
        vel: u8,
    }

    match events {
        None => Default::default(),
        Some(events) => {
            let mut track = Track {
                name: "".into(),
                is_disabled: false,
                polyphony: Polyphony::Automatic,
                is_drum_track: false,
                commands: CommandSeq::new(),
            };

            let voice_idx = instruments.len();
            instruments.push(Instrument {
                patch: PatchAddress {
                    bank_set: BankSetIndex::Music,
                    bank: 0,
                    instrument: 0,
                    envelope: 0,
                },
                pan: 64,
                volume: 100,
                ..Default::default()
            });
            let mut set_bank_patch = false;

            let mut time = 0;
            let mut started_notes: BTreeMap<u8, Note> = BTreeMap::new(); // Maps key to notes that have not finished yet

            let mut instrument_name = None;
            let mut track_name = None;

            /// Linear automaton for reading 'pitch range set' event sequence
            #[derive(PartialEq, Eq)]
            pub enum PitchRangeCommandState {
                None,
                ParameterMSBSet,
                ParameterLSBSet,
            }
            let mut pitch_range_cmd_state = PitchRangeCommandState::None;
            let mut pitch_bend_semitone_range = 2.0;

            for event in events {
                time += event.delta.as_int() as usize;
                let time_cvt = convert_time(time, time_divisor);

                match event.kind {
                    TrackEventKind::Midi { channel: _, message } if track_number != 0 => {
                        match message {
                            MidiMessage::NoteOff { key, vel: _ } => {
                                let key = key.as_int();

                                if let Some(start) = started_notes.remove(&key) {
                                    if track_number == 0 {
                                        log::warn!("master track has notes, ignoring");
                                        break;
                                    }

                                    let length = time - start.time;

                                    track.commands.insert_end(
                                        convert_time(start.time, time_divisor),
                                        Command::Note {
                                            pitch: key + 104,
                                            velocity: start.vel,
                                            length: convert_time(length, time_divisor) as u16,
                                        },
                                    );
                                } else {
                                    log::warn!("found NoteOff {} but saw no NoteOn", key);
                                }
                            }
                            MidiMessage::NoteOn { key, vel } => {
                                let key = key.as_int();
                                let vel = vel.as_int();

                                if vel == 0 {
                                    if let Some(start) = started_notes.remove(&key) {
                                        if track_number == 0 {
                                            log::warn!("master track has notes, ignoring");
                                            break;
                                        }

                                        let length = time - start.time;

                                        track.commands.insert_end(
                                            convert_time(start.time, time_divisor),
                                            Command::Note {
                                                pitch: key + 104,
                                                velocity: start.vel,
                                                length: convert_time(length, time_divisor) as u16,
                                            },
                                        );
                                    } else {
                                        log::warn!("found NoteOn(vel=0) {} but saw no NoteOn(vel>0)", key);
                                    }
                                } else {
                                    started_notes.insert(key, Note { time, vel });
                                }
                            }
                            MidiMessage::PitchBend { bend } => {
                                let pitch_bend_range = pitch_bend_semitone_range * 100.0;
                                let bend_f32 = bend.as_f32() * pitch_bend_range;
                                let bend = bend_f32.round().clamp(i16::MIN as f32, i16::MAX as f32) as i16;

                                track.commands.insert_end(time_cvt, Command::SegTrackTune { bend });
                            }
                            MidiMessage::Aftertouch { key: _, vel } | MidiMessage::ChannelAftertouch { vel } => {
                                track
                                    .commands
                                    .insert_end(time_cvt, Command::SubTrackVolume(vel.as_int()));
                            }
                            MidiMessage::ProgramChange { program } => {
                                let program = program.as_int();
                                let bank = program / 16;
                                let instrument = program % 16;

                                if !set_bank_patch {
                                    instruments[voice_idx].patch.bank = bank;
                                    instruments[voice_idx].patch.instrument = instrument;
                                    set_bank_patch = true;
                                } else {
                                    track.commands.insert_end(
                                        time_cvt,
                                        Command::TrackOverridePatch(PatchAddress {
                                            bank,
                                            instrument,
                                            ..instruments[voice_idx].patch
                                        }),
                                    );
                                }
                            }
                            MidiMessage::Controller { controller, value } => {
                                let controller = controller.as_int();
                                let value = value.as_int(); // Note this is in the range 0..=127

                                // See page 12 of the specification:
                                // https://www.cs.cmu.edu/~music/cmsip/readings/Standard-MIDI-file-format-updated.pdf
                                // Or:
                                // https://www.midi.org/specifications-old/item/table-3-control-change-messages-data-bytes-2
                                match controller {
                                    // Modulation wheel
                                    1 | 33 => {
                                        // Stack exchange says that the synthesizer (that's us!) gets to define
                                        // what the modulation wheel does:
                                        // https://music.stackexchange.com/questions/42847
                                        //
                                        // I declare it...tremolo!
                                        track.commands.insert_end(
                                            time_cvt,
                                            Command::TrackTremolo {
                                                amount: 8,
                                                speed: value,
                                                time: 8,
                                            },
                                        );
                                    }
                                    6 if pitch_range_cmd_state == PitchRangeCommandState::ParameterLSBSet => {
                                        pitch_bend_semitone_range = value as f32;
                                        pitch_range_cmd_state = PitchRangeCommandState::None;
                                    }
                                    // Channel Volume
                                    7 | 39 => track.commands.insert_end(time_cvt, Command::SubTrackVolume(value)),
                                    // Pan
                                    10 | 42 | 8 | 40 => {
                                        track.commands.insert_end(time_cvt, Command::SubTrackPan(value as i8))
                                    }
                                    // Effect control 1
                                    12 | 44 => track.commands.insert_end(time_cvt, Command::SubTrackReverb(value)),
                                    // Damper pedal on/off (sustain)
                                    64 => {
                                        let sustain = if value >= 64 {
                                            // Sustain on
                                            0
                                        } else {
                                            // Sustain off
                                            3
                                        };

                                        track.commands.insert_end(
                                            time_cvt,
                                            Command::TrackOverridePatch(PatchAddress {
                                                envelope: sustain,
                                                ..instruments[voice_idx].patch
                                            }),
                                        );
                                    }
                                    // Sound Controller 3 (Release Time)
                                    72 => {
                                        #[allow(clippy::bool_to_int_with_if)]
                                        let sustain = if value < (127 / 4) {
                                            3 // Staccato
                                        } else if value < (127 / 4) * 2 {
                                            2 // Sustain even less
                                        } else if value < (127 / 4) * 3 {
                                            1 // Sustain less
                                        } else {
                                            0 // Default (sustain)
                                        };

                                        track.commands.insert_end(
                                            time_cvt,
                                            Command::TrackOverridePatch(PatchAddress {
                                                envelope: sustain,
                                                ..instruments[voice_idx].patch
                                            }),
                                        );
                                    }
                                    100 if pitch_range_cmd_state == PitchRangeCommandState::ParameterMSBSet => {
                                        pitch_range_cmd_state = PitchRangeCommandState::ParameterLSBSet;
                                    }
                                    101 if pitch_range_cmd_state == PitchRangeCommandState::None => {
                                        pitch_range_cmd_state = PitchRangeCommandState::ParameterMSBSet;
                                    }
                                    // All notes off / All sound off
                                    123 | 120 => {
                                        for (&key, &start) in &started_notes {
                                            let length = time - start.time;
                                            track.commands.insert_end(
                                                convert_time(start.time, time_divisor),
                                                Command::Note {
                                                    pitch: key + 104,
                                                    velocity: start.vel,
                                                    length: convert_time(length, time_divisor) as u16,
                                                },
                                            );
                                        }

                                        started_notes.clear();
                                    }
                                    // Poly[phonic] mode on/off
                                    126 => {
                                        if value == 0 {
                                            track.polyphony = Polyphony::Manual { voices: 0 };
                                        } else {
                                            track.polyphony = Polyphony::Manual { voices: 1 };
                                        }
                                    }
                                    // Poly[phonic] mode on
                                    127 => {
                                        track.polyphony = Polyphony::Automatic;
                                    }
                                    _ => {
                                        pitch_range_cmd_state = PitchRangeCommandState::None;
                                    }
                                }
                            }
                        }
                    }
                    TrackEventKind::Meta(MetaMessage::Tempo(tempo)) => {
                        if track_number == 0 {
                            let microseconds_per_beat = tempo.as_int() as f32;
                            let beats_per_minute = (60_000_000.0 / microseconds_per_beat).round() as u16;
                            track
                                .commands
                                .insert_end(time_cvt, Command::MasterTempo(beats_per_minute));
                            log::debug!("bpm: {}", beats_per_minute);
                        } else {
                            log::warn!("ignoring non-master tempo change");
                        }
                    }
                    TrackEventKind::Meta(MetaMessage::InstrumentName(s)) => {
                        instrument_name = String::from_utf8(s.to_owned()).ok();
                    }
                    TrackEventKind::Meta(MetaMessage::TrackName(s)) => {
                        track_name = String::from_utf8(s.to_owned()).ok();
                    }
                    TrackEventKind::Meta(MetaMessage::CuePoint(s)) | TrackEventKind::Meta(MetaMessage::Marker(s)) => {
                        if let Ok(s) = String::from_utf8(s.to_owned()) {
                            track.commands.insert_end(time_cvt, Command::Marker { label: s });
                        }
                    }
                    _ => {}
                }
            }

            if !started_notes.is_empty() {
                log::warn!("{} unended notes", started_notes.len());
            }

            if track_number == 0 {
                track.commands.insert_many_start(
                    0,
                    vec![
                        Command::MasterTempo(120),
                        Command::MasterVolume(100),
                        Command::MasterEffect { index: 0, value: 1 },
                    ],
                );
            }

            if track.commands.is_empty() {
                return Track::default();
            }

            if track.commands.max_polyphony() > 0 {
                // Required else the game crashes D:
                track.commands.insert_many_start(
                    0,
                    vec![
                        Command::SubTrackReverb(0),
                        Command::SubTrackVolume(100),
                        Command::SubTrackPan(64),
                        Command::SetTrackVoice { index: voice_idx as u8 },
                    ],
                );
            }

            // There's not a very good way to detect MIDI drum tracks, so we'll just make a best guess by seeing if the
            // designated track title contains 'drums' or 'percussion' (excluding 'steel drums').
            let name_lower = format!("{:?} {:?}", track_name, instrument_name).to_lowercase();
            if (name_lower.contains("drum") && !name_lower.contains("steel")) | name_lower.contains("percussion") {
                // TODO: insert voice instead of drum
                track.is_drum_track = true;
            }

            track.commands.insert_end(total_song_length, Command::End);
            track.commands.shrink();

            if let Some(track_name) = track_name {
                track.name = track_name;
            }

            track
        }
    }
}

fn convert_time(t: usize, time_divisor: f32) -> usize {
    (t as f32 / time_divisor).round() as usize
}
