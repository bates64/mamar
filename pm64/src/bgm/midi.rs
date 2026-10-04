use std::collections::{BTreeMap, BTreeSet};
use std::error::Error;
use std::io::SeekFrom;
use std::io::prelude::*;

use midly::{MetaMessage, MidiMessage, Smf, TrackEventKind};

use super::reimport::MidiMapping;
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
    Ok(import(raw, MidiMapping::default(), &[])?.bgm)
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
/// The keys of the drums General MIDI drum parts play most: kicks, snares, hi-hats, crash and ride cymbals.
const CORE_DRUM_KEYS: [u8; 13] = [35, 36, 37, 38, 39, 40, 42, 44, 46, 49, 51, 54, 57];

/// The keys General MIDI has drums on.
const GENERAL_MIDI_DRUM_KEYS: std::ops::RangeInclusive<u8> = 35..=81;

/// The lowest key a channel 10 part can play a melody from, above the kicks, snares and toms, which drum fills step
/// between.
const LOWEST_MELODY_KEY: u8 = 52;

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

    /// Whether it plays drums, read as `mapping` says, from a single-track file if `is_single_track`.
    fn is_drums(&self, is_single_track: bool, mapping: MidiMapping) -> bool {
        let instrument_name = self
            .events
            .iter()
            .rev()
            .find_map(|(_, kind)| match kind {
                TrackEventKind::Meta(MetaMessage::InstrumentName(name)) => Some(String::from_utf8(name.to_vec()).ok()),
                _ => None,
            })
            .flatten();
        let is_named = is_named_drums(&self.name, mapping)
            || instrument_name
                .as_deref()
                .is_some_and(|name| is_named_drums(name, mapping));
        match mapping {
            MidiMapping::GeneralMidi => {
                // XG plays drums on any channel that selects bank 127
                let selects_drum_bank = self.events.iter().any(|(_, kind)| {
                    matches!(kind, TrackEventKind::Midi { message: MidiMessage::Controller { controller, value }, .. }
                        if controller.as_int() == 0 && value.as_int() == 127)
                });
                (self.channel == 9 && !self.plays_like_melody())
                    || selects_drum_bank
                    || is_named
                    || self.plays_like_drums()
            }
            // Before General MIDI, only a single-track file's channel 10 played drums
            MidiMapping::PaperMario => is_named || (is_single_track && self.channel == 9),
        }
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

    /// The keys of its notes, in order.
    fn keys(&self) -> Vec<u8> {
        self.events
            .iter()
            .filter_map(|(_, kind)| match kind {
                TrackEventKind::Midi {
                    message: MidiMessage::NoteOn { key, vel },
                    ..
                } if vel.as_int() > 0 => Some(key.as_int()),
                _ => None,
            })
            .collect()
    }

    /// Whether it plays as drum parts do, though not on channel 10: as a game rip's drum kit, which some put on their
    /// last program, where General MIDI has a sound effect, or as one drum given a track of its own, choosing no
    /// program.
    fn plays_like_drums(&self) -> bool {
        let keys = self.keys();
        if keys.is_empty() {
            return false;
        }
        let share =
            |within: &dyn Fn(u8) -> bool| keys.iter().filter(|&&key| within(key)).count() as f32 / keys.len() as f32;
        let core = share(&|key| CORE_DRUM_KEYS.contains(&key));
        match self.first_program() {
            Some(127) => share(&|key| GENERAL_MIDI_DRUM_KEYS.contains(&key)) >= 0.95 && core >= 0.7,
            None => {
                let mut distinct = keys.clone();
                distinct.sort_unstable();
                distinct.dedup();
                distinct.len() <= 2 && core == 1.0
            }
            Some(_) => false,
        }
    }

    /// Whether it plays a melody, stepping between neighboring keys above the drums General MIDI puts at the bottom
    /// of its kit, as a channel 10 part of a game rip can. A drum part rarely steps, but for toms, which are low.
    fn plays_like_melody(&self) -> bool {
        let keys = self.keys();
        let mut distinct = keys.clone();
        distinct.sort_unstable();
        distinct.dedup();
        if distinct.len() < 6 || distinct[0] < LOWEST_MELODY_KEY {
            return false;
        }
        let steps = keys
            .windows(2)
            .filter(|pair| matches!(pair[0].abs_diff(pair[1]), 1 | 2))
            .count();
        steps as f32 >= 0.5 * (keys.len() - 1) as f32
    }
}

/// Makes a song from a MIDI file, reading its programs and drum notes as `mapping` says. Markers named `section`,
/// `loop start` and `loop end` start sections there, and a loop between `loop start` and `loop end` repeats forever.
/// Each channel of each track becomes a track of its own, and tempo changes on any track change the song's tempo.
/// Reading General MIDI, samples are chosen that reach each part's notes by `sample_reach`. See [general_midi_sample].
pub fn import(raw: &[u8], mapping: MidiMapping, sample_reach: &[u8]) -> Result<MidiImport, Box<dyn Error>> {
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
    let (parts, mut warnings) = fit_parts(parts, is_single_track, mapping);

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
            mapping,
            sample_reach,
            time_divisor,
            &mut bgm.instruments,
            fitted.instrument,
        );
        track_list.tracks[index + 1]
            .commands
            .insert_end(total_song_length, Command::End);
        track_keys[index + 1] = Some(fitted.part.key.clone());
    }
    normalize_loudness(&mut track_list, &mut bgm.instruments);
    put_drums_last(&mut track_list, &mut track_keys);
    // A song that plays a sample of an aux bank loads it
    let plays_aux = |patch: &PatchAddress| patch.bank_set == BankSetIndex::Aux;
    let overrides_aux = track_list
        .tracks
        .iter()
        .flat_map(|track| track.commands.iter())
        .any(|event| matches!(&event.command, Command::TrackOverridePatch(patch) if plays_aux(patch)));
    if overrides_aux || bgm.instruments.iter().any(|instrument| plays_aux(&instrument.patch)) {
        bgm.aux_banks = vec![GENERAL_MIDI_AUX_BANK.to_string()];
    }
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

/// `parts`, fitted into the [NOTE_TRACKS] the game has. If there are more, a part plays with an earlier part on the
/// same channel that starts with the same program, then the parts with the fewest notes are left out, drums last.
///
/// Reading Paper Mario numbers, as songs imported before Mamar read General MIDI did, the parts Mamar made tracks of
/// before it split tracks by channel aren't joined to others, and are left out last instead of drums, so reimporting a
/// song made then keeps its tracks. Returns warnings of those left out.
fn fit_parts(mut parts: Vec<Fitted>, is_single_track: bool, mapping: MidiMapping) -> (Vec<Fitted>, Vec<String>) {
    let keeps_tracks = mapping == MidiMapping::PaperMario;
    let mut warnings = Vec::new();
    if parts.len() > NOTE_TRACKS {
        let mut merged: Vec<Fitted> = Vec::new();
        for fitted in parts {
            let same = merged.iter_mut().find(|other| {
                !(keeps_tracks && fitted.was_track())
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
            let is_kept_first = if keeps_tracks {
                fitted.was_track()
            } else {
                fitted.part.is_drums(is_single_track, mapping)
            };
            (!is_kept_first, std::cmp::Reverse(fitted.part.note_count()))
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
            Command::MasterVolume(MASTER_VOLUME),
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

/// The master volume a song starts with, before [normalize_loudness] sets it.
const MASTER_VOLUME: u8 = 100;

/// The volume each instrument starts with, before [normalize_loudness] sets it.
pub(crate) const INSTRUMENT_VOLUME: u8 = 100;

/// How loud the game's own songs play, by [loudness]: the median of them.
const VANILLA_LOUDNESS: f64 = 0.95;

/// Longest a note counts for in [loudness], in ticks, as the samples fade before then.
const LOUDEST_LENGTH: usize = 96;

/// An estimate of how loud `track_list` plays, with `instruments`: the root mean square of its notes' volumes, as
/// the game multiplies the master, instrument and track volumes and velocity, weighted by how long each sounds. It
/// can't tell how loud each sample is, or each drum of the shared kit, so it only compares songs that play alike
/// samples, as vanilla songs and imported ones do.
fn loudness(track_list: &TrackList, instruments: &[Instrument]) -> f64 {
    let length = track_list
        .tracks
        .iter()
        .map(|track| track.commands.len_time())
        .max()
        .unwrap_or(0);
    if length == 0 {
        return 0.0;
    }
    let level = |value: u8| (value & 0x7F) as f64 / 127.0;
    let master_changes: Vec<(usize, f64)> = track_list.tracks[0]
        .commands
        .iter_time()
        .filter_map(|(time, event)| match event.command {
            Command::MasterVolume(volume) | Command::MasterVolumeFade { volume, .. } => Some((time, level(volume))),
            _ => None,
        })
        .collect();
    let master_at = |at: usize| {
        master_changes
            .iter()
            .rev()
            .find(|(time, _)| *time <= at)
            .map_or(1.0, |(_, volume)| *volume)
    };
    let mut energy = 0.0;
    for track in track_list.tracks.iter().skip(1).filter(|track| !track.is_disabled) {
        let (mut instrument, mut volume) = (1.0, 1.0);
        for (time, event) in track.commands.iter_time() {
            match event.command {
                Command::SetTrackVoice { index } => {
                    instrument = instruments
                        .get(index as usize)
                        .map_or(1.0, |instrument| level(instrument.volume));
                }
                Command::SubTrackVolume(value) | Command::TrackVolumeFade { value, .. } => instrument = level(value),
                Command::SegTrackVolume(value) => volume = level(value),
                Command::Note { velocity, length, .. } => {
                    let source = if track.is_drum_track { 1.0 } else { instrument };
                    let gain = master_at(time) * source * volume * level(velocity);
                    energy += gain * gain * (length as usize).min(LOUDEST_LENGTH) as f64;
                }
                _ => {}
            }
        }
    }
    (energy / length as f64).sqrt()
}

/// Sets the master volume of `track_list`, which plays `instruments`, so it plays about as loud as the game's own
/// songs, by [loudness]. If the master volume can't go high enough, its instruments' volumes go up the rest of the way.
fn normalize_loudness(track_list: &mut TrackList, instruments: &mut [Instrument]) {
    let loudness = loudness(track_list, instruments);
    if loudness == 0.0 {
        return;
    }
    let wanted = MASTER_VOLUME as f64 * VANILLA_LOUDNESS / loudness;
    let master = wanted.round().clamp(1.0, 127.0) as u8;
    let rest = wanted / master as f64;
    let master_track = &mut track_list.tracks[0];
    master_track.commands = master_track
        .commands
        .iter()
        .map(|event| match event.command {
            Command::MasterVolume(_) => Event {
                command: Command::MasterVolume(master),
                ..event.clone()
            },
            _ => event.clone(),
        })
        .collect();
    if rest <= 1.0 {
        return;
    }
    // Only as far as the loudest volume goes, so the rest keep their balance with it
    let loudest = instruments
        .iter()
        .map(|instrument| instrument.volume)
        .chain(track_list.tracks.iter().flat_map(|track| {
            track.commands.iter().filter_map(|event| match event.command {
                Command::SubTrackVolume(value) => Some(value),
                _ => None,
            })
        }))
        .max()
        .unwrap_or(127)
        .max(1);
    let rest = rest.min(127.0 / loudest as f64);
    let scale = |value: u8| (value as f64 * rest).round().min(127.0) as u8;
    for instrument in instruments.iter_mut() {
        instrument.volume = scale(instrument.volume);
    }
    for track in track_list.tracks.iter_mut().skip(1) {
        track.commands = track
            .commands
            .iter()
            .map(|event| match event.command {
                Command::SubTrackVolume(value) => Event {
                    command: Command::SubTrackVolume(scale(value)),
                    ..event.clone()
                },
                _ => event.clone(),
            })
            .collect();
    }
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

/// The Paper Mario sample, as its number in the music banks, 16 to a bank, that plays each General MIDI program, except
/// those that play [GENERAL_MIDI_AUX_SAMPLES].
#[rustfmt::skip]
const GENERAL_MIDI_SAMPLES: [u8; 128] = [
    // Pianos: acoustic grand, bright, electric grand, honky-tonk, electric 1 and 2, harpsichord, clavinet
    35, 35, 35, 96, 32, 117, 146, 146,
    // Chromatic percussion: celesta, glockenspiel, music box, vibraphone, marimba, xylophone, tubular bells, dulcimer
    9, 128, 37, 6, 0, 3, 114, 130,
    // Organs: drawbar, percussive, rock, church, reed, accordion, harmonica, tango accordion
    78, 77, 99, 163, 78, 137, 137, 137,
    // Guitars: nylon, steel, jazz, clean, muted, overdriven, distortion, harmonics
    39, 41, 32, 32, 32, 68, 68, 82,
    // Basses: acoustic, finger, pick, fretless, slap 1 and 2, synth 1 and 2
    64, 92, 124, 64, 113, 113, 47, 101,
    // Strings: violin, viola, cello, contrabass, tremolo, pizzicato, harp, timpani
    18, 17, 16, 64, 24, 20, 144, 28,
    // Ensembles: strings 1 and 2, synth strings 1 and 2, choir aahs, voice oohs, synth voice, orchestra hit
    24, 24, 25, 26, 89, 89, 165, 136,
    // Brass: trumpet, trombone, tuba, muted trumpet, french horn, brass section, synth brass 1 and 2
    80, 51, 49, 80, 48, 66, 66, 67,
    // Reeds: soprano, alto, tenor and baritone sax, oboe, english horn, bassoon, clarinet
    57, 57, 148, 86, 58, 45, 53, 56,
    // Pipes: piccolo, flute, recorder, pan flute, blown bottle, shakuhachi, whistle, ocarina
    71, 71, 71, 110, 110, 71, 108, 108,
    // Leads: square, sawtooth, calliope, chiff, charang, voice, fifths, bass and lead
    115, 62, 61, 11, 141, 89, 106, 153,
    // Pads: new age, warm, polysynth, choir, bowed, metallic, halo, sweep
    25, 25, 107, 165, 25, 25, 165, 112,
    // Effects: rain, soundtrack, crystal, atmosphere, brightness, goblins, echoes, sci-fi
    121, 25, 122, 25, 117, 25, 165, 112,
    // Ethnic: sitar, banjo, shamisen, koto, kalimba, bagpipe, fiddle, shanai
    102, 85, 102, 144, 135, 45, 18, 58,
    // Percussive: tinkle bell, agogo, steel drums, woodblock, taiko, melodic tom, synth drum, reverse cymbal
    121, 140, 74, 0, 28, 28, 28, 164,
    // Sound effects: fret noise, breath, seashore, bird, telephone, helicopter, applause, gunshot
    82, 71, 164, 125, 132, 164, 164, 136,
];

/// The sample, by its number in the music banks, that plays General MIDI program `program` for a part whose highest
/// key is `highest`. That's the closest sample to the program whose recordings reach the part's notes, by
/// `sample_reach`: the program's own, or another of its family of 8 programs, or else the sample of another program
/// that reaches least further, so notes aren't played lower than they should be. If none reach, it's the one that
/// reaches furthest.
///
/// `sample_reach` is the highest MIDI key each sample's recordings play, by the sample's number, 0 for one it doesn't
/// know. Without it, as without a sound bank to find it in, each program plays its own sample.
fn general_midi_sample(program: u8, highest: u8, sample_reach: &[u8]) -> u8 {
    let reach = |sample: u8| sample_reach.get(sample as usize).copied().unwrap_or(0);
    let reaches = |sample: u8| reach(sample) >= highest;
    let own = GENERAL_MIDI_SAMPLES[program as usize];
    if reach(own) == 0 || reaches(own) {
        return own;
    }
    let family = (program / 8 * 8) as usize;
    if let Some(&sample) = GENERAL_MIDI_SAMPLES[family..family + 8]
        .iter()
        .find(|&&sample| reaches(sample))
    {
        return sample;
    }
    GENERAL_MIDI_SAMPLES
        .iter()
        .copied()
        .filter(|&sample| reaches(sample))
        .min_by_key(|&sample| reach(sample))
        .or_else(|| GENERAL_MIDI_SAMPLES.iter().copied().max_by_key(|&sample| reach(sample)))
        .unwrap_or(own)
}

/// The drum of the drum kit that plays each General MIDI drum note from [FIRST_GENERAL_MIDI_DRUM], or None for one the
/// kit has nothing like. The kit's drums are in an order of their own.
const GENERAL_MIDI_DRUMS: [Option<u8>; 47] = [
    Some(0),  // 35 acoustic bass drum: kick 1
    Some(0),  // 36 bass drum 1: kick 1
    Some(58), // 37 side stick
    Some(1),  // 38 acoustic snare: snare 1
    Some(56), // 39 hand clap
    Some(2),  // 40 electric snare: snare 2
    Some(11), // 41 low floor tom: low tom 2
    Some(3),  // 42 closed hi-hat
    Some(10), // 43 high floor tom: low tom 1
    Some(4),  // 44 pedal hi-hat
    Some(9),  // 45 low tom: mid tom 2
    Some(5),  // 46 open hi-hat
    Some(8),  // 47 low-mid tom: mid tom 1
    Some(7),  // 48 high-mid tom: high tom 2
    Some(12), // 49 crash cymbal 1
    Some(6),  // 50 high tom: high tom 1
    Some(36), // 51 ride cymbal 1
    Some(13), // 52 chinese cymbal: crash cymbal 2
    Some(37), // 53 ride bell
    Some(18), // 54 tambourine
    Some(13), // 55 splash cymbal: crash cymbal 2
    Some(47), // 56 cowbell
    Some(13), // 57 crash cymbal 2
    Some(60), // 58 vibraslap
    Some(36), // 59 ride cymbal 2: ride cymbal 1
    Some(15), // 60 high bongo
    Some(14), // 61 low bongo
    Some(23), // 62 mute high conga
    Some(21), // 63 open high conga
    Some(22), // 64 low conga
    Some(24), // 65 high timbale
    Some(25), // 66 low timbale
    Some(48), // 67 high agogo
    Some(49), // 68 low agogo
    Some(44), // 69 cabasa
    Some(55), // 70 maracas
    Some(52), // 71 short whistle: long low whistle
    Some(53), // 72 long whistle: long low whistle
    Some(27), // 73 short guiro
    Some(26), // 74 long guiro
    Some(46), // 75 claves
    Some(50), // 76 high wood block
    Some(51), // 77 low wood block
    Some(17), // 78 mute cuica
    Some(16), // 79 open cuica
    Some(19), // 80 mute triangle: open triangle
    Some(20), // 81 open triangle
];

/// The General MIDI drum note [GENERAL_MIDI_DRUMS] starts at.
const FIRST_GENERAL_MIDI_DRUM: u8 = 35;

/// The pitch of a drum track's note that plays the drum kit's first drum.
const FIRST_DRUM_PITCH: u8 = 0x80;

/// A MIDI note's pitch in the game, where it plays the same pitch, for a track that isn't drums.
fn pitch_of(key: u8) -> u8 {
    key + 104
}

/// The BK file a song made from a General MIDI file loads into its first aux bank, for [GENERAL_MIDI_AUX_SAMPLES]: the
/// drums that Jade Jungle loads.
const GENERAL_MIDI_AUX_BANK: &str = "PS11";

/// The General MIDI programs that play a sample of [GENERAL_MIDI_AUX_BANK] rather than one in the music banks, with the
/// sample's number there. Jade Jungle plays tunes with these drums.
const GENERAL_MIDI_AUX_SAMPLES: [(u8, u8); 2] = [
    (116, 11), // taiko drum
    (117, 1),  // melodic tom
];

/// The sample that plays `program`, read as `mapping` says, for a part whose highest key is `highest`. See
/// [general_midi_sample] for `sample_reach`.
fn sample_of(program: u8, mapping: MidiMapping, highest: u8, sample_reach: &[u8]) -> PatchAddress {
    if mapping == MidiMapping::GeneralMidi
        && let Some(&(_, instrument)) = GENERAL_MIDI_AUX_SAMPLES
            .iter()
            .find(|(aux_program, _)| *aux_program == program)
    {
        return PatchAddress {
            bank_set: BankSetIndex::Aux,
            bank: 0,
            instrument,
            envelope: 0,
        };
    }
    let number = match mapping {
        MidiMapping::GeneralMidi => general_midi_sample(program, highest, sample_reach),
        MidiMapping::PaperMario => program,
    };
    PatchAddress {
        bank_set: BankSetIndex::Music,
        bank: number / 16,
        instrument: number % 16,
        envelope: 0,
    }
}

/// Whether `name`, a track's or its instrument's, says it plays drums, such as "Drums" or "Percussion", but not "Steel
/// Drums". As `mapping` reads General MIDI, "Perc" and "Kit" do too.
fn is_named_drums(name: &str, mapping: MidiMapping) -> bool {
    let name = name.to_lowercase();
    let drums = (name.contains("drum") && !name.contains("steel")) || name.contains("percussion");
    match mapping {
        MidiMapping::GeneralMidi => drums || name.contains("perc") || name.contains("kit"),
        MidiMapping::PaperMario => drums,
    }
}

/// Makes a track from `part`, reading it as `mapping` says, with `sample_reach` as [general_midi_sample] has it. It
/// plays instrument `instrument` of `instruments`, or one it adds if None.
fn part_to_track(
    part: &Part,
    is_single_track: bool,
    mapping: MidiMapping,
    sample_reach: &[u8],
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

    let is_drum_track = part.is_drums(is_single_track, mapping);

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
    let highest = part.keys().into_iter().max().unwrap_or(0);
    instruments[voice_idx].patch = sample_of(0, mapping, highest, sample_reach);
    let mut set_bank_patch = false;

    // A note's pitch, which plays the drum General MIDI has at that key on a drum track
    let pitch_of_key = |key: u8| -> u8 {
        if is_drum_track && mapping == MidiMapping::GeneralMidi {
            let drum = key
                .checked_sub(FIRST_GENERAL_MIDI_DRUM)
                .and_then(|index| GENERAL_MIDI_DRUMS.get(index as usize))
                .copied()
                .flatten();
            if let Some(drum) = drum {
                return FIRST_DRUM_PITCH + drum;
            }
        }
        pitch_of(key)
    };
    // A note at least a tick long, as shorter ones round to nothing
    let note = |start: Note, end: usize, key: u8| Command::Note {
        pitch: pitch_of_key(key),
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
                    let patch = sample_of(program.as_int(), mapping, highest, sample_reach);
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

    // What the track starts with goes in its instrument, which sets it all at once
    let instrument = &mut instruments[voice_idx];
    timed.retain(|(time, command)| {
        if *time != 0 {
            return true;
        }
        match *command {
            Command::SubTrackVolume(volume) => instrument.volume = volume,
            Command::SubTrackPan(pan) => instrument.pan = pan,
            Command::SubTrackReverb(reverb) => instrument.reverb = reverb,
            Command::TrackOverridePatch(ref patch) => instrument.patch = patch.clone(),
            // A track starts without bending or wavering
            Command::SegTrackTune { bend: 0 } | Command::TrackTremolo { speed: 0, .. } => {}
            _ => return true,
        }
        false
    });

    timed.sort_by_key(|(time, _)| *time);
    for (time, command) in timed {
        track.commands.insert_end(time, command);
    }

    // Required else the game crashes D:
    track
        .commands
        .insert_many_start(0, vec![Command::SetTrackVoice { index: voice_idx as u8 }]);

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
        patch: sample_of(0, MidiMapping::PaperMario, 0, &[]),
        pan: 64,
        volume: INSTRUMENT_VOLUME,
        ..Default::default()
    }
}

#[cfg(test)]
mod test {
    use midly::num::{u4, u7, u14, u15, u24, u28};
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
    fn general_midi_programs_and_drums() {
        let raw = midi(
            48,
            vec![
                vec![],
                vec![
                    (0, on(0, MidiMessage::ProgramChange { program: u7::new(0) })),
                    (0, note_on(0, 60)),
                    (48, note_off(0, 60)),
                ],
                vec![
                    (0, note_on(9, 36)),
                    (24, note_off(9, 36)),
                    (24, note_on(9, 38)),
                    (48, note_off(9, 38)),
                ],
            ],
        );

        let general = import(&raw, MidiMapping::GeneralMidi, &[]).unwrap();
        let (piano, instrument) = track(&general, "#1");
        assert!(!piano.is_drum_track);
        // Acoustic grand piano plays Acoustic Piano 1, sample 35
        assert_eq!((instrument.patch.bank, instrument.patch.instrument), (2, 3));
        let (drums, _) = track(&general, "#2");
        assert!(drums.is_drum_track);
        // Bass drum 1 and acoustic snare play the kit's kick 1 and snare 1
        assert_eq!(
            notes(drums),
            vec![(0, FIRST_DRUM_PITCH, 24), (24, FIRST_DRUM_PITCH + 1, 24)]
        );

        let paper_mario = import(&raw, MidiMapping::PaperMario, &[]).unwrap();
        let (_, instrument) = track(&paper_mario, "#1");
        assert_eq!((instrument.patch.bank, instrument.patch.instrument), (0, 0));
        let (drums, _) = track(&paper_mario, "#2");
        assert!(!drums.is_drum_track);
        assert_eq!(notes(drums), vec![(0, pitch_of(36), 24), (24, pitch_of(38), 24)]);
    }

    #[test]
    fn general_midi_taiko_plays_jade_jungles_drums() {
        let raw = midi(
            48,
            vec![
                vec![],
                vec![
                    (0, on(0, MidiMessage::ProgramChange { program: u7::new(116) })),
                    (0, note_on(0, 48)),
                    (48, note_off(0, 48)),
                ],
            ],
        );

        let general = import(&raw, MidiMapping::GeneralMidi, &[]).unwrap();
        let (_, instrument) = track(&general, "#1");
        assert_eq!(instrument.patch.bank_set, BankSetIndex::Aux);
        assert_eq!((instrument.patch.bank, instrument.patch.instrument), (0, 11));
        assert_eq!(general.bgm.aux_banks, vec!["PS11".to_string()]);

        let paper_mario = import(&raw, MidiMapping::PaperMario, &[]).unwrap();
        let (_, instrument) = track(&paper_mario, "#1");
        assert_eq!(instrument.patch.bank_set, BankSetIndex::Music);
        assert!(paper_mario.bgm.aux_banks.is_empty());
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
        let imported = import(&raw, MidiMapping::PaperMario, &[]).unwrap();
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
        let imported = import(&raw, MidiMapping::PaperMario, &[]).unwrap();
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
        let imported = import(&raw, MidiMapping::PaperMario, &[]).unwrap();
        assert_eq!(notes(track(&imported, "#1").0).len(), 2);
        assert_eq!(notes(track(&imported, "#1/ch2").0), vec![(0, pitch_of(40), 48)]);
    }

    #[test]
    fn tracks_past_the_fifteenth_join_one_on_their_channel() {
        let mut tracks = vec![vec![]];
        for _ in 0..17 {
            tracks.push(vec![(0, note_on(0, 60)), (48, note_off(0, 60))]);
        }
        let imported = import(&midi(48, tracks), MidiMapping::PaperMario, &[]).unwrap();
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
        let imported = import(&raw, MidiMapping::PaperMario, &[]).unwrap();
        let (lead, instrument) = track(&imported, "#1");
        // The channel volume, which the track starts with, so its instrument has it, and that with its expression
        // later, scaled alike to play as loud as vanilla songs do
        let volumes: Vec<u8> = lead
            .commands
            .iter()
            .filter_map(|event| match event.command {
                Command::SubTrackVolume(volume) => Some(volume),
                _ => None,
            })
            .collect();
        assert_eq!(volumes.len(), 1, "{volumes:?}");
        let (channel, expressed) = (instrument.volume as f32, volumes[0] as f32);
        assert!((expressed - channel * 64.0 / 127.0).abs() <= 1.0, "{volumes:?}");
    }

    #[test]
    fn tracks_start_with_only_their_instrument() {
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
                    (0, on(0, MidiMessage::ProgramChange { program: u7::new(1) })),
                    (0, control(10, 20)),
                    (0, control(1, 0)),
                    (
                        0,
                        on(
                            0,
                            MidiMessage::PitchBend {
                                bend: midly::PitchBend(u14::new(0x2000)),
                            },
                        ),
                    ),
                    (0, on(0, MidiMessage::ProgramChange { program: u7::new(5) })),
                    (0, note_on(0, 60)),
                    (48, note_off(0, 60)),
                ],
            ],
        );
        let imported = import(&raw, MidiMapping::PaperMario, &[]).unwrap();
        let (lead, instrument) = track(&imported, "#1");
        let start: Vec<Command> = lead
            .commands
            .iter()
            .take_while(|event| !matches!(event.command, Command::Note { .. } | Command::Delay(_)))
            .map(|event| event.command.clone())
            .collect();
        assert!(matches!(start[..], [Command::SetTrackVoice { .. }]), "{start:?}");
        assert_eq!(instrument.pan, 20);
        assert_eq!((instrument.patch.bank, instrument.patch.instrument), (0, 5));
    }

    #[test]
    fn notes_shorter_than_a_tick_last_one() {
        let raw = midi(480, vec![vec![], vec![(0, note_on(0, 60)), (1, note_off(0, 60))]]);
        let imported = import(&raw, MidiMapping::PaperMario, &[]).unwrap();
        assert_eq!(notes(track(&imported, "#1").0), vec![(0, pitch_of(60), 1)]);
    }

    #[test]
    fn songs_play_about_as_loud_as_vanilla_ones() {
        let master_volume = |imported: &MidiImport| {
            let master = &imported.bgm.track_lists.values().next().unwrap().tracks[0];
            master
                .commands
                .iter()
                .find_map(|event| match event.command {
                    Command::MasterVolume(volume) => Some(volume),
                    _ => None,
                })
                .unwrap()
        };
        let loud = midi(
            48,
            vec![
                vec![],
                (0..4)
                    .flat_map(|voice| {
                        (0..16).flat_map(move |beat| {
                            let key = 60 + voice * 4;
                            let on = on(
                                0,
                                MidiMessage::NoteOn {
                                    key: u7::new(key),
                                    vel: u7::new(127),
                                },
                            );
                            [(beat * 48, on), (beat * 48 + 48, note_off(0, key))]
                        })
                    })
                    .collect(),
            ],
        );
        let quiet = midi(
            48,
            vec![
                vec![],
                vec![
                    (
                        0,
                        on(
                            0,
                            MidiMessage::NoteOn {
                                key: u7::new(60),
                                vel: u7::new(20),
                            },
                        ),
                    ),
                    (48, note_off(0, 60)),
                ],
            ],
        );
        assert!(master_volume(&import(&loud, MidiMapping::PaperMario, &[]).unwrap()) < MASTER_VOLUME);
        assert_eq!(
            master_volume(&import(&quiet, MidiMapping::PaperMario, &[]).unwrap()),
            127
        );
    }
}
