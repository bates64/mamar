use std::error::Error;
use std::rc::Rc;

use midly::Smf;

use crate::bgm::*;

pub fn to_bgm(raw: &[u8]) -> Result<Bgm, Box<dyn Error>> {
    let smf = Smf::parse(raw)?;
    let mut bgm = Bgm::new();
    let mut segment = bgm.add_segment().unwrap();

    let total_song_length = {
        let mut max = 0;

        for track in &smf.tracks {
            let mut length = 0;

            for event in track {
                length += convert_time(event.delta.as_int() as usize);
            }

            if length > max {
                max = length;
            }
        }

        max
    };

    log::debug!("song length: {} ticks", total_song_length);

    segment.subsegments = vec![
        Subsegment::Unknown {
            flags: 0x30,
            data: [0, 0, 0],
        },
        Subsegment::Tracks {
            flags: 0x10,
            tracks: TaggedRc {
                rc: Rc::new([
                    Track {
                        flags: 0xA000,
                        commands: {
                            let mut seq = CommandSeq::from(vec![
                                Command::MasterTempo(128), // smf.header.timing
                                Command::MasterVolume(100),
                                Command::MasterEffect(0),
                            ]);
                            seq.insert(total_song_length, Command::End);
                            seq
                        },
                    },
                    midi_track_to_bgm_track(smf.tracks.get(1), total_song_length),
                    Track::default(),
                    Track::default(),
                    Track::default(),
                    Track::default(),
                    Track::default(),
                    Track::default(),
                    Track::default(),
                    Track::default(),
                    Track::default(),
                    Track::default(),
                    Track::default(),
                    Track::default(),
                    Track::default(),
                    Track::default(),
                    /*midi_track_to_bgm_track(smf.tracks.get(2), total_song_length),
                    midi_track_to_bgm_track(smf.tracks.get(3), total_song_length),
                    midi_track_to_bgm_track(smf.tracks.get(4), total_song_length),
                    midi_track_to_bgm_track(smf.tracks.get(5), total_song_length),
                    midi_track_to_bgm_track(smf.tracks.get(6), total_song_length),
                    midi_track_to_bgm_track(smf.tracks.get(7), total_song_length),
                    midi_track_to_bgm_track(smf.tracks.get(8), total_song_length),
                    midi_track_to_bgm_track(smf.tracks.get(9), total_song_length),
                    midi_track_to_bgm_track(smf.tracks.get(10), total_song_length),
                    midi_track_to_bgm_track(smf.tracks.get(11), total_song_length),
                    midi_track_to_bgm_track(smf.tracks.get(12), total_song_length),
                    midi_track_to_bgm_track(smf.tracks.get(13), total_song_length),
                    midi_track_to_bgm_track(smf.tracks.get(14), total_song_length),
                    midi_track_to_bgm_track(smf.tracks.get(15), total_song_length),*/
                ]),
                decoded_pos: None,
            },
        },
        Subsegment::Unknown {
            flags: 0x50,
            data: [0, 0, 0],
        },
    ];

    Ok(bgm)
}

fn midi_track_to_bgm_track(events: Option<&Vec<midly::TrackEvent>>,total_song_length: usize) -> Track {
    use std::collections::HashMap;

    use midly::{TrackEventKind, MidiMessage};

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
                commands: CommandSeq::from(vec![
                    Command::SubTrackReverb(0),
                    Command::TrackOverridePatch { bank: 48, patch: 0 },
                    Command::SubTrackVolume(100),
                    Command::SubTrackPan(64),
                ]),
            };

            let mut time = 0;
            let mut started_notes: HashMap<u8, Note> = HashMap::new(); // Maps key to notes that have not finished yet

            for event in events {
                time += convert_time(event.delta.as_int() as usize);

                if let TrackEventKind::Midi { channel: _, message } = event.kind {
                    match message {
                        MidiMessage::NoteOff { key, vel: _ } => {
                            let key = key.as_int();

                            if let Some(start) = started_notes.remove(&key) {
                                let length = time - start.time;

                                track.commands.insert(start.time, Command::Note {
                                    pitch: key,
                                    velocity: start.vel,
                                    length: length as u16,
                                    flag: false,
                                });
                            } else {
                                log::warn!("found NoteOff {} but saw no NoteOn", key);
                            }
                        },
                        MidiMessage::NoteOn { key, vel } => {
                            let key = key.as_int();
                            let vel = vel.as_int();

                            if vel == 0 {
                                if let Some(start) = started_notes.remove(&key) {
                                    let length = time - start.time;

                                    track.commands.insert(start.time, Command::Note {
                                        pitch: key,
                                        velocity: start.vel,
                                        length: length as u16,
                                        flag: false,
                                    });
                                } else {
                                    log::warn!("found NoteOn(vel=0) {} but saw no NoteOn(vel>0)", key);
                                }
                            } else {
                                started_notes.insert(key, Note { time, vel });
                            }
                        },
                        _ => {},
                    }
                }
            }

            if !started_notes.is_empty() {
                log::warn!("{} unended notes", started_notes.len());
            }

            track.commands.insert(total_song_length, Command::End);

            track
        },
    }
}

// TODO
fn convert_time(t: usize) -> usize {
    t / 2
}
