use std::fmt;
use std::collections::HashMap;
use std::rc::Rc;
use codec::bgm::*;
use midly::{num::*, TrackEventKind, MidiMessage, MetaMessage};
use log::*;

#[derive(Debug)]
pub enum Error {
    SmfParse(midly::Error),
}

impl From<midly::Error> for Error {
    fn from(source: midly::Error) -> Self {
        Self::SmfParse(source)
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::SmfParse(source) => write!(f, "{}", source),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Error::SmfParse(source) => Some(source),
            _ => None,
        }
    }
}

struct OnNote {
    vel: u7,
    start_time: usize,
}

/// Performs a best-attempt conversion from a SMF (standard MIDI file) to a [Bgm].
pub fn smf_to_bgm(raw: &[u8]) -> Result<Bgm, Error> {
    let (_header, tracks) = midly::parse(raw)?;

    let mut bgm_tracks = [
        // TODO: set flags!!
        Track::default(), Track::default(), Track::default(), Track::default(),
        Track::default(), Track::default(), Track::default(), Track::default(),
        Track::default(), Track::default(),
        Track { flags: 0xE080, commands: CommandSeq::new() }, // Track 10 is always a drum track in SMF
        Track::default(),
        Track::default(), Track::default(), Track::default(), Track::default(),
    ];

    // TODO: handle header timing
    bgm_tracks[0].commands.insert(0, Command::MasterTempo(120));

    let mut max_time = 0;

    for (track_no, track) in tracks.enumerate().take(16) {
        if track_no != 1 {
            continue; // TEMP
        }

        let bgm_track = &mut bgm_tracks[track_no];
        let seq = &mut bgm_track.commands;

        bgm_track.flags |= 0xA000;

        let mut time = 0;
        let mut notes_on = HashMap::new();

        for event in track? {
            let event = event?;

            time += event.delta.as_int() as usize;

            match event.kind {
                TrackEventKind::Midi { channel, message} => {
                    // TODO: handle channel? e.g. set instrument
                    match message {
                        MidiMessage::NoteOn { key, vel } => {
                            if track_no == 0 {
                                error!("master track cannot have notes");
                                break;
                            }

                            if vel == u7::from(0) {
                                // This is a note-off in disguise!
                                if let Some(OnNote { vel, start_time }) = notes_on.remove(&key) {
                                    seq.insert(time, Command::Note {
                                        pitch: key.as_int(),
                                        velocity: vel.as_int(),
                                        length: (time - start_time) as u16,
                                        flag: false,
                                    });
                                }
                            } else {
                                notes_on.insert(key, OnNote {
                                    vel,
                                    start_time: time,
                                });
                            }
                        },

                        MidiMessage::NoteOff { key, vel: _ } => {
                            if track_no == 0 {
                                error!("master track cannot have notes");
                                break;
                            }

                            if let Some(OnNote { vel, start_time }) = notes_on.remove(&key) {
                                seq.insert(time, Command::Note {
                                    pitch: key.as_int(),
                                    velocity: vel.as_int(),
                                    length: (time - start_time) as u16,
                                    flag: false,
                                });
                            }
                        },
                        _ => (),
                    }
                },
                TrackEventKind::Meta(message) => match message {
                    MetaMessage::EndOfTrack => {
                        // Master track has End inserted later
                        if track_no != 0 {
                            seq.insert(time, Command::End);
                        }
                    },
                    _ => (),
                },
                _ => (),
            }

            if time > max_time {
                max_time = time;
            }
        }
    }

    // Delay master track End until end of longest track
    bgm_tracks[0].commands.insert(max_time, Command::End);

    let bgm = Bgm {
        index: "MID ".to_owned(),
        segments: [
            Some(vec![
                Subsegment::Unknown {
                    flags: 0x30,
                    data: [0, 0, 0],
                },

                Subsegment::Tracks {
                    flags: 0x10,
                    tracks: TaggedRc {
                        decoded_pos: None,
                        rc: Rc::new(bgm_tracks),
                    },
                },

                Subsegment::Unknown {
                    flags: 0x50,
                    data: [0, 0, 0],
                },
            ]),
            None,
            None,
            None,
        ],
        drums: vec![],
        voices: vec![],
    };

    // Sanity check
    #[cfg(debug_assertions)] {
        let encoded = &bgm.as_bytes().unwrap();
        info!("{:?}", encoded);
        Bgm::from_bytes(encoded).unwrap();
    }

    Ok(bgm)
}
