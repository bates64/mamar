use std::collections::{BTreeMap, BTreeSet};
use std::error::Error;
use std::io::SeekFrom;
use std::io::prelude::*;

use midly::{MetaMessage, MidiMessage, Smf, TrackEventKind};

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
    Ok(import(raw)?.bgm)
}

/// A song made from a MIDI file, with what [reimporting](super::reimport) needs to know about where it came from.
pub struct MidiImport {
    pub bgm: Bgm,
    /// The source track each track came from, by [TrackKey](super::reimport::TrackKey). None for empty tracks.
    pub track_keys: Vec<Option<String>>,
    /// Whether the file's markers set the sections.
    pub has_section_markers: bool,
    /// Markers that couldn't be used, such as a `loop end` without a `loop start`.
    pub warnings: Vec<String>,
}

/// What a marker in the MIDI file asks for. See [import].
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum SectionMarker {
    Section,
    LoopStart,
    LoopEnd,
}

impl SectionMarker {
    fn parse(text: &str) -> Option<Self> {
        match text.trim().to_lowercase().as_str() {
            "section" => Some(SectionMarker::Section),
            "loop start" => Some(SectionMarker::LoopStart),
            "loop end" => Some(SectionMarker::LoopEnd),
            _ => None,
        }
    }
}

/// Makes a song from a MIDI file. Markers named `section`, `loop start` and `loop end` start sections there, and a
/// The tracks the game has for a section's notes, after its master track.
const NOTE_TRACKS: usize = 15;

/// The longest track name used as a region's name. Longer ones are usually comments or credits.
const LONGEST_NAME: usize = 24;

/// A track to make from a MIDI file: the events of one channel of one of its tracks.
struct Part<'a> {
    /// Its [TrackKey](super::reimport::TrackKey). See [parts].
    key: String,
    /// The name of the MIDI track it's from.
    name: String,
    channel: u8,
    /// Its events, with when in MIDI ticks.
    events: Vec<(usize, TrackEventKind<'a>)>,
}

impl Part<'_> {
    fn note_count(&self) -> usize {
        self.events
            .iter()
            .filter(|(_, kind)| match kind {
                TrackEventKind::Midi {
                    message: MidiMessage::NoteOn { vel, .. },
                    ..
                } => vel.as_int() > 0,
                _ => false,
            })
            .count()
    }

    /// Whether it plays drums: its track's or instrument's name says so, or it's channel 10 of a single-track file, if
    /// `is_single_track`.
    fn is_drums(&self, is_single_track: bool) -> bool {
        let instrument_name = self
            .events
            .iter()
            .rev()
            .find_map(|(_, kind)| match kind {
                TrackEventKind::Meta(MetaMessage::InstrumentName(name)) => Some(String::from_utf8(name.to_vec()).ok()),
                _ => None,
            })
            .flatten();
        let is_named = is_named_drums(&self.name) || instrument_name.as_deref().is_some_and(is_named_drums);
        is_named || (is_single_track && self.channel == 9)
    }

    /// The program it plays its first note with, if it chooses one before then.
    fn first_program(&self) -> Option<u8> {
        self.events
            .iter()
            .take_while(|(_, kind)| {
                !matches!(
                    kind,
                    TrackEventKind::Midi {
                        message: MidiMessage::NoteOn { .. },
                        ..
                    }
                )
            })
            .filter_map(|(_, kind)| match kind {
                TrackEventKind::Midi {
                    message: MidiMessage::ProgramChange { program },
                    ..
                } => Some(program.as_int()),
                _ => None,
            })
            .last()
    }
}

/// Makes a song from a MIDI file. Markers named `section`, `loop start` and `loop end` start sections there, and a
/// loop between `loop start` and `loop end` repeats forever. Each channel of each track becomes a track of its own, and
/// tempo changes on any track change the song's tempo.
pub fn import(raw: &[u8]) -> Result<MidiImport, Box<dyn Error>> {
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

    let tracks: Vec<Vec<(usize, TrackEventKind)>> = smf
        .tracks
        .iter()
        .map(|track| {
            let mut time = 0;
            track
                .iter()
                .map(|event| {
                    time += event.delta.as_int() as usize;
                    (time, event.kind)
                })
                .collect()
        })
        .collect();
    let total_song_length = convert_time(
        tracks
            .iter()
            .filter_map(|track| track.last().map(|(time, _)| *time))
            .max()
            .unwrap_or(0),
        time_divisor,
    );
    log::debug!("song length: {} ticks (48 ticks/beat)", total_song_length);

    let is_single_track = smf.header.format == midly::Format::SingleTrack && tracks.len() == 1;
    let (parts, reserved) = parts(&tracks, is_single_track);
    bgm.instruments = (0..reserved).map(|_| new_instrument()).collect();
    let (parts, mut warnings) = fit_parts(parts);

    // Section markers can be on any track, and the master track has the other markers of tracks without notes
    let mut markers = Vec::new();
    let mut master_labels = Vec::new();
    for (index, track) in tracks.iter().enumerate() {
        let has_part = parts.iter().any(|part| part.key_track == Some(index));
        for (time, kind) in track {
            if let TrackEventKind::Meta(MetaMessage::CuePoint(text) | MetaMessage::Marker(text)) = kind
                && let Ok(text) = String::from_utf8(text.to_vec())
            {
                match SectionMarker::parse(&text) {
                    Some(marker) => markers.push((convert_time(*time, time_divisor), marker)),
                    None if !has_part => master_labels.push((convert_time(*time, time_divisor), text)),
                    None => {}
                }
            }
        }
    }

    let mut track_list = TrackList {
        pos: None,
        tracks: Default::default(),
    };
    track_list.tracks[0] = master_track(&tracks, &master_labels, total_song_length, time_divisor);
    let mut track_keys = vec![None; track_list.tracks.len()];
    track_keys[0] = Some("master".to_string());
    for (index, fitted) in parts.iter().enumerate() {
        track_list.tracks[index + 1] = part_to_track(
            &fitted.part,
            is_single_track,
            total_song_length,
            time_divisor,
            &mut bgm.instruments,
            fitted.instrument,
        );
        track_keys[index + 1] = Some(fitted.part.key.clone());
    }
    put_drums_last(&mut track_list, &mut track_keys);
    let track_list_id = bgm.add_track_list(track_list);

    let (_, variation) = bgm.add_variation().unwrap();
    variation.segments = vec![Segment::Subseg {
        id: Some(gen_id()),
        track_list: track_list_id,
    }];

    let has_section_markers = apply_section_markers(&mut bgm, &markers, total_song_length, &mut warnings);

    Ok(MidiImport {
        bgm,
        track_keys,
        has_section_markers,
        warnings,
    })
}

/// A part that fits in the song, with the MIDI track whose key it has.
struct Fitted<'a> {
    part: Part<'a>,
    /// The MIDI track it's from, if it has that track's key rather than one of a channel split from it.
    key_track: Option<usize>,
    /// The instrument it plays, if Mamar gave its track or channel one before it split tracks by channel. See [parts].
    instrument: Option<usize>,
}

impl Fitted<'_> {
    /// Whether Mamar made a track of it before it split tracks by channel, when a multi-track file's first track was
    /// its master track.
    fn was_track(&self) -> bool {
        self.instrument.is_some() && self.key_track != Some(0)
    }
}

/// Whether `track` has events that Mamar made commands of before it split tracks by channel. A track's first program
/// only chose its instrument, and controllers it didn't read made nothing.
fn had_commands(track: &[(usize, TrackEventKind)]) -> bool {
    let programs = track
        .iter()
        .filter(|(_, kind)| {
            matches!(
                kind,
                TrackEventKind::Midi {
                    message: MidiMessage::ProgramChange { .. },
                    ..
                }
            )
        })
        .count();
    programs > 1
        || track.iter().any(|(_, kind)| match kind {
            TrackEventKind::Midi { message, .. } => match message {
                MidiMessage::NoteOn { vel, .. } => vel.as_int() > 0,
                MidiMessage::PitchBend { .. }
                | MidiMessage::Aftertouch { .. }
                | MidiMessage::ChannelAftertouch { .. } => true,
                MidiMessage::Controller { controller, .. } => {
                    matches!(
                        controller.as_int(),
                        1 | 33 | 7 | 39 | 10 | 42 | 8 | 40 | 12 | 44 | 64 | 72
                    )
                }
                _ => false,
            },
            TrackEventKind::Meta(MetaMessage::CuePoint(text) | MetaMessage::Marker(text)) => {
                String::from_utf8(text.to_vec()).is_ok_and(|text| SectionMarker::parse(&text).is_none())
            }
            _ => false,
        })
}

/// The parts of a MIDI file's `tracks`: a part for each channel of each track with notes, and how many instruments
/// the song starts with for them. A single-track file's parts have keys `ch1` to `ch16`. Otherwise, the channel of a
/// track with the most notes has the track's key: its name, if no other of the first 16 tracks has it, or its
/// position, such as `#3`. Each of its other channels has the track's key and the channel, such as `#3/ch2`.
///
/// Before Mamar split tracks by channel, it made a track of each of the first 16 tracks, or of each channel of a
/// single-track file after a master track, and gave each an instrument. The parts that were those tracks have their
/// keys and instruments, so reimporting a song made then finds its tracks, and they keep playing their instruments.
fn parts<'a>(tracks: &[Vec<(usize, TrackEventKind<'a>)>], is_single_track: bool) -> (Vec<Fitted<'a>>, usize) {
    let notes_by_channel = |track: &[(usize, TrackEventKind)]| {
        let mut notes: BTreeMap<u8, usize> = BTreeMap::new();
        for (_, kind) in track {
            if let TrackEventKind::Midi { channel, message } = kind {
                let count = notes.entry(channel.as_int()).or_default();
                if matches!(message, MidiMessage::NoteOn { vel, .. } if vel.as_int() > 0) {
                    *count += 1;
                }
            }
        }
        notes.retain(|_, count| *count > 0);
        notes
    };
    let names: Vec<String> = tracks.iter().map(|track| name_of_track(track)).collect();
    // The tracks Mamar made of the first 16, which a name had to be unique among, the master track always being one
    let had_track: Vec<bool> = tracks
        .iter()
        .enumerate()
        .map(|(index, track)| index < 16 && (index == 0 || had_commands(track)))
        .collect();
    // A single-track file's channels, in order, which had the instruments after the master track's
    let mut old_channels: Vec<u8> = match tracks.first() {
        Some(track) if is_single_track => track
            .iter()
            .filter_map(|(_, kind)| match kind {
                TrackEventKind::Midi { channel, .. } => Some(channel.as_int()),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    };
    old_channels.sort_unstable();
    old_channels.dedup();
    old_channels.truncate(NOTE_TRACKS);
    let reserved = if is_single_track {
        1 + old_channels.len()
    } else {
        tracks.len().min(16)
    };

    let mut parts = Vec::new();
    for (index, track) in tracks.iter().enumerate() {
        let notes = notes_by_channel(track);
        let Some(&busiest) = notes
            .iter()
            .max_by_key(|&(channel, count)| (*count, std::cmp::Reverse(*channel)))
            .map(|(channel, _)| channel)
        else {
            continue;
        };
        let name = &names[index];
        let is_unique = !name.is_empty()
            && if had_track[index] {
                (0..tracks.len())
                    .filter(|&other| had_track[other] && names[other] == *name)
                    .count()
                    == 1
            } else {
                (0..tracks.len()).filter(|&other| names[other] == *name).count() == 1
            };
        let track_key = if is_unique { name.clone() } else { format!("#{index}") };
        for &channel in notes.keys() {
            let (key, key_track, instrument) = if is_single_track {
                let instrument = old_channels
                    .iter()
                    .position(|&old| old == channel)
                    .map(|position| position + 1);
                (format!("ch{}", channel + 1), None, instrument)
            } else if channel == busiest {
                (track_key.clone(), Some(index), (index < reserved).then_some(index))
            } else {
                (format!("{track_key}/ch{}", channel + 1), None, None)
            };
            let events = track
                .iter()
                .filter(|(_, kind)| match kind {
                    TrackEventKind::Midi { channel: of, .. } => of.as_int() == channel,
                    // Markers that aren't sections go with the track's key
                    TrackEventKind::Meta(MetaMessage::CuePoint(_) | MetaMessage::Marker(_)) => key_track.is_some(),
                    TrackEventKind::Meta(MetaMessage::TrackName(_) | MetaMessage::InstrumentName(_)) => true,
                    _ => false,
                })
                .cloned()
                .collect();
            parts.push(Fitted {
                part: Part {
                    key,
                    name: name.clone(),
                    channel,
                    events,
                },
                key_track,
                instrument,
            });
        }
    }
    (parts, reserved)
}

/// `parts`, fitted into the [NOTE_TRACKS] the game has. If there are more, a part Mamar didn't make a track of before
/// it split tracks by channel plays with an earlier part on the same channel that starts with the same program, then
/// the parts with the fewest notes are left out, leaving those Mamar made tracks of until last, so reimporting a song
/// made then keeps its tracks. Returns warnings of those left out.
fn fit_parts(mut parts: Vec<Fitted>) -> (Vec<Fitted>, Vec<String>) {
    let mut warnings = Vec::new();
    if parts.len() > NOTE_TRACKS {
        let mut merged: Vec<Fitted> = Vec::new();
        for fitted in parts {
            let same = merged.iter_mut().find(|other| {
                !fitted.was_track()
                    && other.part.channel == fitted.part.channel
                    && other.part.first_program() == fitted.part.first_program()
            });
            match same {
                Some(other) => {
                    // It starts with the program the part it joins starts with already
                    let first_note = fitted.part.events.iter().position(|(_, kind)| {
                        matches!(
                            kind,
                            TrackEventKind::Midi {
                                message: MidiMessage::NoteOn { .. },
                                ..
                            }
                        )
                    });
                    let events = fitted.part.events.into_iter().enumerate().filter(|(index, (_, kind))| {
                        !(first_note.is_some_and(|first| *index < first)
                            && matches!(
                                kind,
                                TrackEventKind::Midi {
                                    message: MidiMessage::ProgramChange { .. },
                                    ..
                                }
                            ))
                    });
                    other.part.events.extend(events.map(|(_, event)| event));
                    other.part.events.sort_by_key(|(time, _)| *time);
                }
                None => merged.push(fitted),
            }
        }
        parts = merged;
    }
    if parts.len() > NOTE_TRACKS {
        let mut ranked: Vec<usize> = (0..parts.len()).collect();
        ranked.sort_by_key(|&index| {
            let fitted = &parts[index];
            (!fitted.was_track(), std::cmp::Reverse(fitted.part.note_count()))
        });
        let kept: BTreeSet<usize> = ranked.into_iter().take(NOTE_TRACKS).collect();
        let mut index = 0;
        parts.retain(|fitted| {
            let keep = kept.contains(&index);
            index += 1;
            if !keep {
                let name = if fitted.part.name.is_empty() {
                    fitted.part.key.as_str()
                } else {
                    fitted.part.name.as_str()
                };
                warnings.push(format!(
                    "{name} was left out, as the game has room for {NOTE_TRACKS} tracks of notes."
                ));
            }
            keep
        });
    }
    (parts, warnings)
}

/// The master track: the tempo changes of every track of the file, and `labels`, the markers of tracks without notes.
fn master_track(
    tracks: &[Vec<(usize, TrackEventKind)>],
    labels: &[(usize, String)],
    total_song_length: usize,
    time_divisor: f32,
) -> Track {
    let mut commands = CommandSeq::new();
    let mut tempos: Vec<(usize, u16)> = tracks
        .iter()
        .flatten()
        .filter_map(|(time, kind)| match kind {
            TrackEventKind::Meta(MetaMessage::Tempo(tempo)) => {
                let beats_per_minute = (60_000_000.0 / tempo.as_int() as f32).round() as u16;
                Some((convert_time(*time, time_divisor), beats_per_minute))
            }
            _ => None,
        })
        .collect();
    tempos.sort();
    tempos.dedup();
    for (time, beats_per_minute) in tempos {
        commands.insert_end(time, Command::MasterTempo(beats_per_minute));
    }
    for (time, label) in labels {
        commands.insert_end(*time, Command::Marker { label: label.clone() });
    }
    commands.insert_many_start(
        0,
        vec![
            Command::MasterTempo(120),
            Command::MasterVolume(100),
            Command::MasterEffect { index: 0, value: 1 },
        ],
    );
    commands.insert_end(total_song_length, Command::End);
    commands.shrink();
    Track {
        name: tracks.first().map(|track| name_of_track(track)).unwrap_or_default(),
        is_disabled: false,
        commands,
        ..Track::default()
    }
}

/// The name `track` gives itself last, or nothing if that isn't UTF-8, as Mamar named tracks before it split them by
/// channel, so that reimporting a song made then finds tracks by the same names.
fn name_of_track(track: &[(usize, TrackEventKind)]) -> String {
    track
        .iter()
        .rev()
        .find_map(|(_, kind)| match kind {
            TrackEventKind::Meta(MetaMessage::TrackName(name)) => Some(String::from_utf8(name.to_vec()).ok()),
            _ => None,
        })
        .flatten()
        .unwrap_or_default()
}

/// Moves the drum tracks after the other tracks, before the unused ones, keeping each group in order, with their keys.
/// The game gives tracks their voices in order, and sound effects take the last voices from the music, so drums go
/// last, as in vanilla songs, where a drum hit cut short is hardly heard.
fn put_drums_last(track_list: &mut TrackList, track_keys: &mut [Option<String>]) {
    let mut order: Vec<usize> = (1..track_list.tracks.len()).collect();
    // Unused tracks stay at the end
    order.sort_by_key(|&index| {
        (
            track_list.tracks[index].commands.is_empty(),
            track_list.tracks[index].is_drum_track,
        )
    });
    order.insert(0, 0);
    let tracks = track_list.tracks.clone();
    let keys = track_keys.to_vec();
    for (to, &from) in order.iter().enumerate() {
        track_list.tracks[to] = tracks[from].clone();
        track_keys[to] = keys[from].clone();
    }
}

/// Splits variation 0 at each section marker and adds the loops they mark. Returns whether there were any.
fn apply_section_markers(
    bgm: &mut Bgm,
    markers: &[(usize, SectionMarker)],
    total_song_length: usize,
    warnings: &mut Vec<String>,
) -> bool {
    if markers.is_empty() {
        return false;
    }

    let mut markers = markers.to_vec();
    markers.sort_by_key(|(time, _)| *time);

    let mut boundaries: Vec<usize> = markers
        .iter()
        .map(|(time, _)| *time)
        .filter(|time| *time > 0 && *time < total_song_length)
        .collect();
    boundaries.dedup();
    for time in &boundaries {
        bgm.split_variation_at(0, *time);
    }

    // Pair each loop start with the loop end after it
    let mut loops = Vec::new();
    let mut open: Option<usize> = None;
    for (time, marker) in &markers {
        match marker {
            SectionMarker::LoopStart => {
                if open.is_some() {
                    warnings.push(format!(
                        "A loop start at tick {time} comes before the last one ended, so it was ignored."
                    ));
                } else {
                    open = Some(*time);
                }
            }
            SectionMarker::LoopEnd => match open.take() {
                Some(start) if start < *time => loops.push((start, *time)),
                _ => warnings.push(format!(
                    "A loop end at tick {time} has no loop start before it, so it was ignored."
                )),
            },
            SectionMarker::Section => {}
        }
    }
    if let Some(start) = open {
        warnings.push(format!(
            "A loop start at tick {start} has no loop end after it, so it was ignored."
        ));
    }

    let branches = bgm.branches.clone();
    let track_lists = bgm.track_lists.clone();
    let variation = bgm.variations[0].as_mut().unwrap();
    for (label, (start, end)) in loops.into_iter().enumerate() {
        let label = label + 1;

        // Where each section starts and ends
        let mut spans = Vec::new();
        let mut time = 0;
        for (index, segment) in variation.segments.iter().enumerate() {
            if let Segment::Subseg { track_list, .. } = segment {
                let len = track_lists.get(track_list).map_or(0, |tl| tl.len_time(&branches));
                spans.push((index, time, time + len));
                time += len;
            }
        }

        let first = spans
            .iter()
            .find(|(_, from, _)| *from == start)
            .map(|(index, ..)| *index);
        let last = spans
            .iter()
            .find(|(_, _, to)| *to == end.min(total_song_length))
            .map(|(index, ..)| *index);
        let (Some(first), Some(last)) = (first, last) else {
            warnings.push(format!(
                "The loop from tick {start} to {end} doesn't line up with sections, so it was ignored."
            ));
            continue;
        };

        variation.segments.insert(
            last + 1,
            Segment::EndLoop {
                id: Some(gen_id()),
                label_index: label as u8,
                iter_count: 0,
            },
        );
        variation.segments.insert(
            first,
            Segment::StartLoop {
                id: Some(gen_id()),
                label_index: label as u16,
            },
        );
    }

    true
}

/// A MIDI note's pitch in the game, where it plays the same pitch.
fn pitch_of(key: u8) -> u8 {
    key + 104
}

/// The sample that plays `program`: the one with that number in the music banks, 16 to a bank.
fn sample_of(program: u8) -> PatchAddress {
    PatchAddress {
        bank_set: BankSetIndex::Music,
        bank: program / 16,
        instrument: program % 16,
        envelope: 0,
    }
}

/// Whether `name`, a track's or its instrument's, says it plays drums, such as "Drums" or "Percussion", but not "Steel
/// Drums".
fn is_named_drums(name: &str) -> bool {
    let name = name.to_lowercase();
    (name.contains("drum") && !name.contains("steel")) || name.contains("percussion")
}

/// Makes a track from `part`. It plays instrument `instrument` of `instruments`, or one it adds if None.
fn part_to_track(
    part: &Part,
    is_single_track: bool,
    total_song_length: usize,
    time_divisor: f32,
    instruments: &mut Vec<Instrument>,
    instrument: Option<usize>,
) -> Track {
    /// A note that has started and not yet ended
    #[derive(Clone, Copy)]
    struct Note {
        time: usize,
        vel: u8,
    }

    /// Linear automaton for reading 'pitch range set' event sequence
    #[derive(PartialEq, Eq)]
    enum PitchRangeCommandState {
        None,
        ParameterMSBSet,
        ParameterLSBSet,
    }

    let is_drum_track = part.is_drums(is_single_track);

    let mut track = Track {
        name: String::new(),
        is_disabled: false,
        polyphonic_idx: None,
        is_drum_track,
        alternate_for: None,
        commands: CommandSeq::new(),
        pos: None,
    };

    let voice_idx = instrument.unwrap_or_else(|| {
        instruments.push(new_instrument());
        instruments.len() - 1
    });
    instruments[voice_idx].patch = sample_of(0);
    let mut set_bank_patch = false;

    // A note at least a tick long, as shorter ones round to nothing
    let note = |start: Note, end: usize, key: u8| Command::Note {
        pitch: pitch_of(key),
        velocity: start.vel,
        length: convert_time(end - start.time, time_divisor).max(1) as u16,
    };

    // Commands, with when, in the order they're made. Notes are only made once they end, so they're put in time order
    // after.
    let mut timed: Vec<(usize, Command)> = Vec::new();
    let mut put = |time: usize, command: Command| timed.push((time, command));
    let mut started_notes: BTreeMap<u8, Note> = BTreeMap::new(); // Maps key to notes that have not finished yet
    let mut pitch_range_cmd_state = PitchRangeCommandState::None;
    let mut pitch_bend_semitone_range = 2.0;
    // The track's volume is its channel volume scaled by its expression
    let mut channel_volume: u32 = 100;
    let mut expression: u32 = 127;

    for &(time, kind) in &part.events {
        let time_cvt = convert_time(time, time_divisor);
        match kind {
            TrackEventKind::Midi { channel: _, message } => match message {
                MidiMessage::NoteOff { key, vel: _ } | MidiMessage::NoteOn { key, vel: _ }
                    if matches!(message, MidiMessage::NoteOff { .. })
                        || matches!(message, MidiMessage::NoteOn { vel, .. } if vel.as_int() == 0) =>
                {
                    let key = key.as_int();
                    if let Some(start) = started_notes.remove(&key) {
                        put(convert_time(start.time, time_divisor), note(start, time, key));
                    } else {
                        log::warn!("found note end {} but saw no NoteOn", key);
                    }
                }
                MidiMessage::NoteOn { key, vel } => {
                    let key = key.as_int();
                    // The same key starting again ends the note playing it, as a synthesizer would
                    if let Some(start) = started_notes.remove(&key) {
                        put(convert_time(start.time, time_divisor), note(start, time, key));
                    }
                    started_notes.insert(
                        key,
                        Note {
                            time,
                            vel: vel.as_int(),
                        },
                    );
                }
                MidiMessage::PitchBend { bend } => {
                    let pitch_bend_range = pitch_bend_semitone_range * 100.0;
                    let bend_f32 = bend.as_f32() * pitch_bend_range;
                    let bend = bend_f32.round().clamp(i16::MIN as f32, i16::MAX as f32) as i16;

                    put(time_cvt, Command::SegTrackTune { bend });
                }
                MidiMessage::ProgramChange { program } => {
                    let patch = sample_of(program.as_int());
                    if !set_bank_patch {
                        instruments[voice_idx].patch = patch;
                        set_bank_patch = true;
                    } else {
                        put(
                            time_cvt,
                            Command::TrackOverridePatch(PatchAddress {
                                envelope: instruments[voice_idx].patch.envelope,
                                ..patch
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
                            put(
                                time_cvt,
                                Command::TrackTremolo {
                                    delay: 8,
                                    speed: value,
                                    depth: 8,
                                },
                            );
                        }
                        6 if pitch_range_cmd_state == PitchRangeCommandState::ParameterLSBSet => {
                            pitch_bend_semitone_range = value as f32;
                            pitch_range_cmd_state = PitchRangeCommandState::None;
                        }
                        // Channel volume and expression
                        7 | 39 | 11 | 43 => {
                            if matches!(controller, 7 | 39) {
                                channel_volume = value as u32;
                            } else {
                                expression = value as u32;
                            }
                            let volume = (channel_volume * expression / 127) as u8;
                            put(time_cvt, Command::SubTrackVolume(volume));
                        }
                        // Pan
                        10 | 42 | 8 | 40 => put(time_cvt, Command::SubTrackPan(value as i8)),
                        // Effect control 1
                        12 | 44 => put(time_cvt, Command::SubTrackReverb(value)),
                        // Damper pedal on/off (sustain)
                        64 => {
                            let sustain = if value >= 64 {
                                // Sustain on
                                0
                            } else {
                                // Sustain off
                                3
                            };

                            put(
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

                            put(
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
                                put(convert_time(start.time, time_divisor), note(start, time, key));
                            }
                            started_notes.clear();
                        }
                        _ => {
                            pitch_range_cmd_state = PitchRangeCommandState::None;
                        }
                    }
                }
                _ => {}
            },
            TrackEventKind::Meta(MetaMessage::CuePoint(text) | MetaMessage::Marker(text)) => {
                if let Ok(text) = String::from_utf8(text.to_vec())
                    && SectionMarker::parse(&text).is_none()
                {
                    put(time_cvt, Command::Marker { label: text });
                }
            }
            _ => {}
        }
    }

    if !started_notes.is_empty() {
        log::warn!("{} unended notes", started_notes.len());
    }

    timed.sort_by_key(|(time, _)| *time);
    for (time, command) in timed {
        track.commands.insert_end(time, command);
    }

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

    track.commands.insert_end(total_song_length, Command::End);
    track.commands.shrink();

    // A long name is usually a comment or credit, so the region is called after its instrument instead
    let name = part.name.trim();
    if name.chars().count() <= LONGEST_NAME {
        track.name = name.to_string();
    }

    track
}

fn convert_time(t: usize, time_divisor: f32) -> usize {
    (t as f32 / time_divisor).round() as usize
}

/// An instrument for a track to play, until it chooses a program.
fn new_instrument() -> Instrument {
    Instrument {
        patch: sample_of(0),
        pan: 64,
        volume: 100,
        ..Default::default()
    }
}

#[cfg(test)]
mod test {
    use midly::num::{u4, u7, u15, u24, u28};
    use midly::{Header, Timing, TrackEvent};

    use super::*;

    /// A channel message on `channel`.
    fn on(channel: u8, message: MidiMessage) -> TrackEventKind<'static> {
        TrackEventKind::Midi {
            channel: u4::new(channel),
            message,
        }
    }

    fn note_on(channel: u8, key: u8) -> TrackEventKind<'static> {
        on(
            channel,
            MidiMessage::NoteOn {
                key: u7::new(key),
                vel: u7::new(100),
            },
        )
    }

    fn note_off(channel: u8, key: u8) -> TrackEventKind<'static> {
        on(
            channel,
            MidiMessage::NoteOff {
                key: u7::new(key),
                vel: u7::new(0),
            },
        )
    }

    /// Writes a multi-track MIDI file of `tracks`, each a list of events with when, at `ticks_per_beat`.
    fn midi(ticks_per_beat: u16, tracks: Vec<Vec<(u32, TrackEventKind<'static>)>>) -> Vec<u8> {
        let tracks = tracks
            .into_iter()
            .map(|mut events| {
                events.sort_by_key(|(time, _)| *time);
                let mut last = 0;
                let mut track: Vec<TrackEvent> = events
                    .into_iter()
                    .map(|(time, kind)| {
                        let delta = time - last;
                        last = time;
                        TrackEvent {
                            delta: u28::new(delta),
                            kind,
                        }
                    })
                    .collect();
                track.push(TrackEvent {
                    delta: u28::new(0),
                    kind: TrackEventKind::Meta(MetaMessage::EndOfTrack),
                });
                track
            })
            .collect();
        let smf = Smf {
            header: Header::new(midly::Format::Parallel, Timing::Metrical(u15::new(ticks_per_beat))),
            tracks,
        };
        let mut bytes = Vec::new();
        smf.write_std(&mut bytes).unwrap();
        bytes
    }

    /// The song's track with key `key`, and the instrument it plays.
    fn track<'a>(imported: &'a MidiImport, key: &str) -> (&'a Track, &'a Instrument) {
        let index = imported
            .track_keys
            .iter()
            .position(|k| k.as_deref() == Some(key))
            .unwrap();
        let track = &imported.bgm.track_lists.values().next().unwrap().tracks[index];
        let voice = track
            .commands
            .iter()
            .find_map(|event| match event.command {
                Command::SetTrackVoice { index } => Some(index),
                _ => None,
            })
            .unwrap();
        (track, &imported.bgm.instruments[voice as usize])
    }

    /// The notes `track` plays, as (start, pitch, length).
    fn notes(track: &Track) -> Vec<(usize, u8, u16)> {
        track
            .commands
            .iter_time()
            .filter_map(|(time, event)| match event.command {
                Command::Note { pitch, length, .. } => Some((time, pitch, length)),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn a_key_starting_again_ends_its_note() {
        let raw = midi(
            48,
            vec![
                vec![],
                vec![(0, note_on(0, 60)), (24, note_on(0, 60)), (48, note_off(0, 60))],
            ],
        );
        let imported = import(&raw).unwrap();
        let (lead, _) = track(&imported, "#1");
        assert_eq!(notes(lead), vec![(0, pitch_of(60), 24), (24, pitch_of(60), 24)]);
    }

    #[test]
    fn notes_on_the_first_track_and_tempo_on_any_track() {
        let raw = midi(
            48,
            vec![
                vec![(0, note_on(0, 60)), (48, note_off(0, 60))],
                vec![
                    (0, TrackEventKind::Meta(MetaMessage::Tempo(u24::new(400_000)))),
                    (0, note_on(1, 64)),
                    (48, note_off(1, 64)),
                ],
            ],
        );
        let imported = import(&raw).unwrap();
        assert_eq!(notes(track(&imported, "#0").0), vec![(0, pitch_of(60), 48)]);
        assert_eq!(notes(track(&imported, "#1").0), vec![(0, pitch_of(64), 48)]);
        let master = &imported.bgm.track_lists.values().next().unwrap().tracks[0];
        assert!(
            master
                .commands
                .iter()
                .any(|event| event.command == Command::MasterTempo(150))
        );
    }

    #[test]
    fn a_track_on_several_channels_is_split() {
        let raw = midi(
            48,
            vec![
                vec![],
                vec![
                    (0, note_on(0, 60)),
                    (24, note_off(0, 60)),
                    (24, note_on(0, 62)),
                    (48, note_off(0, 62)),
                    (0, note_on(1, 40)),
                    (48, note_off(1, 40)),
                ],
            ],
        );
        let imported = import(&raw).unwrap();
        assert_eq!(notes(track(&imported, "#1").0).len(), 2);
        assert_eq!(notes(track(&imported, "#1/ch2").0), vec![(0, pitch_of(40), 48)]);
    }

    #[test]
    fn tracks_past_the_fifteenth_join_one_on_their_channel() {
        let mut tracks = vec![vec![]];
        for _ in 0..17 {
            tracks.push(vec![(0, note_on(0, 60)), (48, note_off(0, 60))]);
        }
        let imported = import(&midi(48, tracks)).unwrap();
        let track_list = imported.bgm.track_lists.values().next().unwrap();
        let with_notes = track_list
            .tracks
            .iter()
            .filter(|track| !notes(track).is_empty())
            .count();
        assert_eq!(with_notes, NOTE_TRACKS);
        let played: usize = track_list.tracks.iter().map(|track| notes(track).len()).sum();
        assert_eq!(played, 17);
        assert!(imported.warnings.is_empty());
    }

    #[test]
    fn expression_scales_the_volume() {
        let control = |controller: u8, value: u8| {
            on(
                0,
                MidiMessage::Controller {
                    controller: u7::new(controller),
                    value: u7::new(value),
                },
            )
        };
        let raw = midi(
            48,
            vec![
                vec![],
                vec![
                    (0, control(7, 100)),
                    (12, control(11, 64)),
                    (0, note_on(0, 60)),
                    (48, note_off(0, 60)),
                ],
            ],
        );
        let imported = import(&raw).unwrap();
        let (lead, _) = track(&imported, "#1");
        assert!(
            lead.commands
                .iter()
                .any(|event| event.command == Command::SubTrackVolume(50))
        );
    }

    #[test]
    fn notes_shorter_than_a_tick_last_one() {
        let raw = midi(480, vec![vec![], vec![(0, note_on(0, 60)), (1, note_off(0, 60))]]);
        let imported = import(&raw).unwrap();
        assert_eq!(notes(track(&imported, "#1").0), vec![(0, pitch_of(60), 1)]);
    }
}
