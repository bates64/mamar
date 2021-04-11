use std::error::Error;
use std::io::prelude::*;
use std::io::SeekFrom;

use midly::{MetaMessage, Smf};

use crate::bgm::*;
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

    bgm.index = "152 ".to_string(); // TODO: is this required?

    let total_song_length = {
        let mut max = 0;

        for track in &smf.tracks {
            let mut length = 0;

            for event in track {
                length += convert_time(event.delta.as_int() as usize, time_divisor);
            }

            if length > max {
                max = length;
            }
        }

        max
    };

    log::debug!("song length: {} ticks (48 ticks/beat)", total_song_length);

    let track_list = bgm.track_lists.alloc(TrackList {
        pos: None,
        tracks: [
            midi_track_to_bgm_track(smf.tracks.get(0), total_song_length, true, time_divisor),
            midi_track_to_bgm_track(smf.tracks.get(1), total_song_length, false, time_divisor),
            midi_track_to_bgm_track(smf.tracks.get(2), total_song_length, false, time_divisor),
            midi_track_to_bgm_track(smf.tracks.get(3), total_song_length, false, time_divisor),
            midi_track_to_bgm_track(smf.tracks.get(4), total_song_length, false, time_divisor),
            midi_track_to_bgm_track(smf.tracks.get(5), total_song_length, false, time_divisor),
            midi_track_to_bgm_track(smf.tracks.get(6), total_song_length, false, time_divisor),
            midi_track_to_bgm_track(smf.tracks.get(7), total_song_length, false, time_divisor),
            midi_track_to_bgm_track(smf.tracks.get(8), total_song_length, false, time_divisor),
            midi_track_to_bgm_track(smf.tracks.get(9), total_song_length, false, time_divisor),
            midi_track_to_bgm_track(smf.tracks.get(10), total_song_length, false, time_divisor),
            midi_track_to_bgm_track(smf.tracks.get(11), total_song_length, false, time_divisor),
            midi_track_to_bgm_track(smf.tracks.get(12), total_song_length, false, time_divisor),
            midi_track_to_bgm_track(smf.tracks.get(13), total_song_length, false, time_divisor),
            midi_track_to_bgm_track(smf.tracks.get(14), total_song_length, false, time_divisor),
            midi_track_to_bgm_track(smf.tracks.get(15), total_song_length, false, time_divisor),
        ],
    });

    let mut segment = bgm.add_segment().unwrap();
    segment.subsegments = vec![
        Subsegment::Unknown {
            flags: 0x30,
            data: [0, 0, 0],
        },
        Subsegment::Tracks {
            flags: 0x10,
            track_list,
        },
        Subsegment::Unknown {
            flags: 0x50,
            data: [0, 0, 0],
        },
    ];

    Ok(bgm)
}

fn midi_track_to_bgm_track(events: Option<&Vec<midly::TrackEvent>>, total_song_length: usize, is_master: bool, time_divisor: f32) -> Track {
    use std::collections::HashMap;

    use midly::{MidiMessage, TrackEventKind};

    /// NoteOn data
    struct Note {
        time: usize,
        vel: u8,
    }

    match events {
        None => Track::default(),
        Some(events) => {
            let mut track = Track {
                flags: 0xA000,
                commands: CommandSeq::new(),
            };

            let mut time = 0;
            let mut started_notes: HashMap<u8, Note> = HashMap::new(); // Maps key to notes that have not finished yet

            for event in events {
                time += event.delta.as_int() as usize;

                match event.kind {
                    TrackEventKind::Midi { channel: _, message } => {
                        match message {
                            MidiMessage::NoteOff { key, vel: _ } => {
                                let key = key.as_int();

                                if let Some(start) = started_notes.remove(&key) {
                                    let length = time - start.time;

                                    track.commands.insert(
                                        convert_time(start.time, time_divisor),
                                        Command::Note {
                                            pitch: key + 104,
                                            velocity: start.vel,
                                            length: convert_time(length as usize, time_divisor) as u16,
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
                                        let length = time - start.time;

                                        track.commands.insert(
                                            convert_time(start.time, time_divisor),
                                            Command::Note {
                                                pitch: key + 104,
                                                velocity: start.vel,
                                                length: length as u16,
                                            },
                                        );
                                    } else {
                                        log::warn!("found NoteOn(vel=0) {} but saw no NoteOn(vel>0)", key);
                                    }
                                } else {
                                    started_notes.insert(key, Note { time, vel });
                                }
                            }
                            MidiMessage::ProgramChange { program } => {
                                log::debug!("program change: {}", program);
                                track.commands.insert(
                                    convert_time(time, time_divisor),
                                    Command::TrackOverridePatch { bank: 48, patch: program.as_int() },
                                );
                            }
                            _ => {}
                        }
                    }
                    TrackEventKind::Meta(MetaMessage::Tempo(tempo)) => if is_master {
                        let microseconds_per_beat = tempo.as_int() as f32;
                        let beats_per_minute = (60_000_000.0 / microseconds_per_beat).round() as u16;
                        track.commands.insert(
                            convert_time(time, time_divisor),
                            Command::MasterTempo(beats_per_minute),
                        );
                        log::debug!("bpm: {}", beats_per_minute);
                    } else {
                        log::warn!("ignoring non-master tempo change");
                    }
                    _ => {}
                }
            }

            if !started_notes.is_empty() {
                log::warn!("{} unended notes", started_notes.len());
            }

            if is_master {
                track.commands.insert_many(0, vec![
                    Command::MasterTempo(120),
                    Command::MasterVolume(100),
                    Command::MasterEffect(0, 1),
                ]);
            }

            if track.commands.is_empty() {
                return Track::default();
            }

            track.commands.insert(total_song_length, Command::End);

            if !is_master {
                // Required else the game crashes D:
                track.commands.insert_many(0, vec![
                    Command::SubTrackReverb(0),
                    Command::TrackOverridePatch { bank: 48, patch: 1 },
                    Command::SubTrackVolume(100),
                    Command::SubTrackPan(64),
                ]);
            }

            track
        }
    }
}

fn convert_time(t: usize, time_divisor: f32) -> usize {
    (t as f32 / time_divisor).round() as usize
}
