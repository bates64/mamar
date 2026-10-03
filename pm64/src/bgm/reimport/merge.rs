//! Making a song from a MIDI file, and merging a new version of the file into it.

use std::collections::HashMap;
use std::error::Error;

use super::*;

/// A song made from a MIDI file, linked to it, with its last import.
pub struct Imported {
    pub bgm: Bgm,
    pub base: Timeline,
    pub warnings: Vec<String>,
}

/// Makes a song from a MIDI file named `name`, reading its programs and drum notes as `mapping` says, with
/// `sample_reach` as [midi::import] has it, linked to the file so that it can be reimported.
pub fn import(raw: &[u8], name: &str, mapping: MidiMapping, sample_reach: &[u8]) -> Result<Imported, Box<dyn Error>> {
    let midi = midi::import(raw, mapping, sample_reach)?;
    let mut bgm = midi.bgm;
    let track_keys = padded(midi.track_keys);
    let base = timeline(&bgm, &track_keys)?;
    let source_hash = hash(raw);
    bgm.import = Some(ImportLink {
        id: source_hash,
        source_name: name.to_string(),
        source_hash,
        track_keys,
        base_hash: hash(&canonical(&base)),
        patch: Patch::default(),
        mapping,
    });
    Ok(Imported {
        bgm,
        base,
        warnings: midi.warnings,
    })
}

fn padded(mut track_keys: Vec<Option<TrackKey>>) -> Vec<Option<TrackKey>> {
    track_keys.resize(16, None);
    track_keys
}

/// Setup at the start of a track, such as its instrument, which comes from the song rather than the MIDI file.
fn is_setup(timed: &Timed) -> bool {
    timed.tick == 0
        && matches!(
            timed.command,
            Command::SetTrackVoice { .. }
                | Command::SubTrackVolume(_)
                | Command::SubTrackPan(_)
                | Command::SubTrackReverb(_)
        )
}

/// What makes two commands the same place in a track: a note's pitch, or anything else's kind.
fn slot(command: &Command) -> (std::mem::Discriminant<Command>, Option<u8>) {
    let pitch = match command {
        Command::Note { pitch, .. } => Some(*pitch),
        _ => None,
    };
    (std::mem::discriminant(command), pitch)
}

/// Whether the source changed what's at `timed`'s slot, within a tick either side to allow for rounding.
fn source_changed(timed: &Timed, base: &[Timed], theirs: &[Timed]) -> bool {
    let near = |track: &[Timed]| {
        let mut commands: Vec<Vec<u8>> = track
            .iter()
            .filter(|other| other.tick.abs_diff(timed.tick) <= 1 && slot(&other.command) == slot(&timed.command))
            .map(|other| rmp_serde::to_vec(&other.command).unwrap_or_default())
            .collect();
        commands.sort();
        commands
    };
    near(base) != near(theirs)
}

/// Removes `timed` from `track`, or else the same command a tick either side of it.
fn remove_near(track: &mut Vec<Timed>, timed: &Timed) {
    let index = track.iter().position(|other| other == timed).or_else(|| {
        track
            .iter()
            .position(|other| other.command == timed.command && other.tick.abs_diff(timed.tick) <= 1)
    });
    if let Some(index) = index {
        track.remove(index);
    }
}

/// Merges one track: the source's version, with Mamar's edits applied where the source didn't change the same slot.
/// Returns the merged track and how many edits were dropped.
fn merge_track(base: &[Timed], ours: &[Timed], theirs: &[Timed]) -> (Vec<Timed>, usize) {
    // The song's setup goes first, as the import's did
    let mut track: Vec<Timed> = ours.iter().filter(|timed| is_setup(timed)).cloned().collect();
    let mut merged: Vec<Timed> = theirs.iter().filter(|timed| !is_setup(timed)).cloned().collect();
    let mut dropped = 0;

    for removed in difference(base, ours).iter().filter(|timed| !is_setup(timed)) {
        remove_near(&mut merged, removed);
    }
    for added in difference(ours, base).into_iter().filter(|timed| !is_setup(timed)) {
        if source_changed(&added, base, theirs) {
            dropped += 1;
        } else {
            merged.push(added);
        }
    }

    track.extend(merged);
    (track, dropped)
}

/// A track's commands as one sequence `len` ticks long. Commands at the same tick keep their order, with notes last.
fn sequence(track: &[Timed], len: usize) -> CommandSeq {
    let mut track: Vec<&Timed> = track.iter().filter(|timed| (timed.tick as usize) < len).collect();
    track.sort_by_key(|timed| (timed.tick, matches!(timed.command, Command::Note { .. })));

    let mut seq = CommandSeq::new();
    let mut now = 0;
    for timed in track {
        let tick = timed.tick as usize;
        if tick > now {
            seq.push(Command::Delay(tick - now));
            now = tick;
        }
        seq.push(timed.command.clone());
    }
    if len > now {
        seq.push(Command::Delay(len - now));
    }
    seq.push(Command::End);
    seq
}

/// Cuts a track's sequence into a piece for each span. Each piece after the first starts with the settings in force,
/// as [CommandSeq::split_at] does.
fn cut(mut seq: CommandSeq, spans: &[Span]) -> Vec<CommandSeq> {
    let mut pieces = Vec::new();
    for (index, span) in spans.iter().enumerate() {
        if index + 1 == spans.len() {
            pieces.push(seq);
            break;
        }
        let mut rest = seq.split_at(span.len);
        rest.shrink();
        pieces.push(seq);
        seq = rest;
    }
    pieces
}

/// Reimports the MIDI file `raw`, named `name`, into `bgm`. `base` is the last import, if it could be kept or rebuilt;
/// without it, every note comes from the file and only the song's settings, sections and Mamar-only tracks are kept.
/// `sample_reach` is as [midi::import] has it.
pub fn reimport(
    bgm: &Bgm,
    base: Option<&Timeline>,
    raw: &[u8],
    name: &str,
    sample_reach: &[u8],
) -> Result<(Bgm, Timeline, Report), Box<dyn Error>> {
    let link = bgm
        .import
        .clone()
        .ok_or("This song wasn't imported from a MIDI file.")?;
    let mut report = Report::default();

    let source_hash = hash(raw);
    if source_hash == link.source_hash {
        report.unchanged = true;
        let base = match base {
            Some(base) => base.clone(),
            None => timeline(bgm, &link.track_keys)?,
        };
        return Ok((bgm.clone(), base, report));
    }

    let new = midi::import(raw, link.mapping, sample_reach)?;
    report.problems.extend(new.warnings.iter().cloned());
    let their_keys = padded(new.track_keys.clone());
    let theirs = timeline(&new.bgm, &their_keys)?;
    // The new import's tracks, with their names and drum flags
    let their_tracks = new.bgm.track_lists.values().next().map(|track_list| &track_list.tracks);

    let our_keys = padded(link.track_keys.clone());
    let ours = timeline(bgm, &our_keys)?;
    let base = match base {
        Some(base) => base.clone(),
        None => {
            report.problems.push(
                "Changes to notes made in Mamar weren't kept, because the last import couldn't be rebuilt. Open the \
                 song with your ROM loaded to keep them."
                    .to_string(),
            );
            ours.clone()
        }
    };

    // Which of the song's tracks each source track goes to
    let mut keys: Vec<Option<TrackKey>> = our_keys;
    let mut in_theirs = [false; 16];
    let mut added = Vec::new();
    for (their_index, key) in their_keys.iter().enumerate() {
        let Some(key) = key else { continue };
        let numbered = format!("#{their_index}");
        if let Some(index) = keys.iter().position(|k| k.as_ref() == Some(key)) {
            in_theirs[index] = true;
        } else if keys[their_index].as_ref() == Some(&numbered) && !their_keys.contains(&Some(numbered)) {
            // The track has been given a name since
            keys[their_index] = Some(key.clone());
            in_theirs[their_index] = true;
        } else {
            added.push((their_index, key.clone()));
        }
    }

    let mut out = bgm.clone();
    let old_spans = spans(bgm)?;
    let old_tracks: Vec<Vec<Timed>> = (0..16).map(|index| track_timeline(bgm, &old_spans, index)).collect();

    // A track that varies by proximity mix plays its branches' time without delays of its own, so it can't be cut up
    // like the others. It's left as it is.
    let branching: Vec<bool> = old_tracks
        .iter()
        .map(|track| track.iter().any(|timed| is_mamar_only(&timed.command)))
        .collect();

    // Each track's merged commands, along the whole timeline
    let mut merged: Vec<Option<Vec<Timed>>> = vec![None; 16];
    let mut fresh: Vec<Option<Vec<Timed>>> = vec![None; 16]; // The same, as the new import alone
    let mut dropped = 0;
    let empty = Vec::new();
    for index in 0..16 {
        let Some(key) = &keys[index] else { continue };
        let base = base.get(key).unwrap_or(&empty);
        let ours = ours.get(key).unwrap_or(&empty);
        if branching[index] {
            report.problems.push(format!(
                "Track \"{}\" varies by proximity mix, so it wasn't updated.",
                track_name(bgm, index, key)
            ));
        } else if in_theirs[index] {
            let theirs = theirs.get(key).unwrap_or(&empty);
            let (track, count) = merge_track(base, ours, theirs);
            dropped += count;
            merged[index] = Some(track);
            fresh[index] = Some(theirs.clone());
        } else {
            // Removed from the file: keep what Mamar added, with the track's instrument and settings
            let mut track = difference(ours, base);
            if !track.is_empty() {
                track.splice(0..0, ours.iter().filter(|timed| is_setup(timed)).cloned());
            }
            report.problems.push(format!(
                "Track \"{}\" is no longer in the MIDI file, so its notes were removed.",
                track_name(bgm, index, key)
            ));
            merged[index] = Some(track);
            keys[index] = None;
        }
    }

    // Tracks new in the file go in free tracks
    let mut added_tracks: Vec<(usize, usize)> = Vec::new(); // (song track, new import's track)
    for (their_index, key) in added {
        let free = (1..16).find(|&index| {
            keys[index].is_none()
                && merged[index].is_none()
                && old_tracks[index].is_empty()
                && added_tracks.iter().all(|(taken, _)| *taken != index)
        });
        let Some(index) = free else {
            report.problems.push(format!(
                "Track \"{key}\" is new in the MIDI file, but there's no free track for it."
            ));
            continue;
        };

        // Bring its instrument along
        let mut track = theirs.get(&key).cloned().unwrap_or_default();
        for timed in &mut track {
            if let Command::SetTrackVoice { index: voice } = &mut timed.command
                && let Some(instrument) = new.bgm.instruments.get(*voice as usize)
            {
                out.instruments.push(instrument.clone());
                *voice = (out.instruments.len() - 1) as u8;
            }
        }
        keys[index] = Some(key);
        fresh[index] = Some(track.clone());
        merged[index] = Some(track);
        added_tracks.push((index, their_index));
    }

    if dropped > 0 {
        report.problems.push(format!(
            "{dropped} edits made in Mamar were overwritten by the MIDI file, which changed the same notes."
        ));
    }

    // The sections to cut the timeline into, in the order they play: the new file's, if it marks them, else the song's
    let their_spans = spans(&new.bgm)?;
    let new_len: usize = their_spans.iter().map(|span| span.len).sum();
    let use_markers = new.has_section_markers && !branching.contains(&true);
    if new.has_section_markers && !use_markers {
        report
            .problems
            .push("The MIDI file's section markers were ignored, because a track varies by proximity mix.".to_string());
    }
    let layout: Vec<Span> = if use_markers {
        // Each new section starts as a copy of the song's section playing at the same time
        let template = |start: usize| -> TrackListId {
            old_spans
                .iter()
                .rev()
                .find(|span| span.start <= start)
                .or(old_spans.first())
                .map_or(0, |span| span.track_list)
        };
        let mut layout = Vec::new();
        let mut segments = new.bgm.variations[0].as_ref().unwrap().segments.clone();
        let mut renumbered = HashMap::new();
        let mut their_spans = their_spans.iter();
        for segment in &mut segments {
            if let Segment::Subseg { track_list, .. } = segment {
                let span = their_spans.next().unwrap();
                let id = *renumbered.entry(*track_list).or_insert_with(|| {
                    let template = out.track_lists[&template(span.start)].clone();
                    out.add_track_list(template)
                });
                *track_list = id;
                layout.push(Span {
                    track_list: id,
                    ..*span
                });
            }
        }
        out.variations[0].as_mut().unwrap().segments = segments;
        remove_unused_track_lists(&mut out, old_spans.iter().map(|span| span.track_list));
        layout
    } else {
        let mut kept: Vec<Span> = old_spans
            .iter()
            .enumerate()
            .filter(|(index, span)| *index == 0 || span.start < new_len)
            .map(|(_, span)| *span)
            .collect();
        if let Some(last) = kept.last_mut() {
            last.len = new_len.saturating_sub(last.start);
        }
        let dropped_spans = old_spans.len() - kept.len();
        if dropped_spans > 0 {
            let variation = out.variations[0].as_mut().unwrap();
            let mut seen = 0;
            variation.segments.retain(|segment| match segment {
                Segment::Subseg { .. } => {
                    seen += 1;
                    seen <= kept.len()
                }
                _ => true,
            });
            remove_empty_loops(&mut variation.segments);
            remove_unused_track_lists(&mut out, old_spans[kept.len()..].iter().map(|span| span.track_list));
            report.problems.push(format!(
                "The MIDI file got shorter, so {dropped_spans} sections at the end were removed."
            ));
        }
        let mut track_lists: Vec<TrackListId> = kept.iter().map(|span| span.track_list).collect();
        track_lists.sort();
        track_lists.dedup();
        if track_lists.len() < kept.len() {
            report
                .problems
                .push("A section that plays more than once was filled from where it first plays.".to_string());
        }
        kept
    };

    // Cut each track into the sections and write them into the track lists
    let pieces: Vec<Option<Vec<CommandSeq>>> = (0..16)
        .map(|index| {
            let track = match &merged[index] {
                Some(track) => track,
                // Made in Mamar: recut only if the sections changed
                None if keys[index].is_none() && use_markers => &old_tracks[index],
                None => return None,
            };
            if track.is_empty() && old_tracks[index].is_empty() {
                return None;
            }
            Some(cut(sequence(track, new_len), &layout))
        })
        .collect();
    let filled = fill(&mut out, &layout, &pieces);
    for id in &filled {
        let target = out.track_lists.get_mut(id).unwrap();
        for (index, their_index) in &added_tracks {
            if let Some(source) = their_tracks.map(|tracks| &tracks[*their_index]) {
                let track = &mut target.tracks[*index];
                track.name = source.name.clone();
                track.is_drum_track = source.is_drum_track;
                track.is_disabled = false;
                track.alternate_for = None;
            }
        }
        for (index, key) in keys.iter().enumerate() {
            if key.is_none() && merged[index].as_ref().is_some_and(|track| track.is_empty()) {
                // A removed track with nothing left in it
                target.tracks[index].commands = CommandSeq::new();
            }
        }
    }

    // The new last import: the song as the new file alone would have made it
    let mut base_song = out.clone();
    let fresh_pieces: Vec<Option<Vec<CommandSeq>>> = fresh
        .iter()
        .map(|track| track.as_ref().map(|track| cut(sequence(track, new_len), &layout)))
        .collect();
    fill(&mut base_song, &layout, &fresh_pieces);
    let new_base = timeline(&base_song, &keys)?;

    out.import = Some(ImportLink {
        id: link.id,
        source_name: name.to_string(),
        source_hash,
        base_hash: hash(&canonical(&new_base)),
        track_keys: keys,
        patch: Patch::default(),
        mapping: link.mapping,
    });

    Ok((out, new_base, report))
}

/// Writes each track's pieces into the track lists of `layout`, one piece per span. A track list that plays more than
/// once is filled from where it first plays. Returns the track lists filled.
fn fill(bgm: &mut Bgm, layout: &[Span], pieces: &[Option<Vec<CommandSeq>>]) -> Vec<TrackListId> {
    let mut filled: Vec<TrackListId> = Vec::new();
    for (piece_index, span) in layout.iter().enumerate() {
        if filled.contains(&span.track_list) {
            continue;
        }
        let Some(target) = bgm.track_lists.get_mut(&span.track_list) else {
            continue;
        };
        filled.push(span.track_list);
        target.pos = None;
        for (track, pieces) in target.tracks.iter_mut().zip(pieces) {
            let Some(pieces) = pieces else { continue };
            track.commands = pieces[piece_index].clone();
            track.polyphonic_idx = None;
            track.pos = None;
        }
    }
    filled
}

/// Removes those of `ids` that no variation plays.
fn remove_unused_track_lists(bgm: &mut Bgm, ids: impl IntoIterator<Item = TrackListId>) {
    for id in ids {
        let used = bgm.variations.iter().flatten().any(|variation| {
            variation
                .segments
                .iter()
                .any(|segment| matches!(segment, Segment::Subseg { track_list, .. } if *track_list == id))
        });
        if !used {
            bgm.track_lists.remove(&id);
        }
    }
}

fn track_name(bgm: &Bgm, index: usize, key: &str) -> String {
    bgm.track_lists
        .values()
        .map(|track_list| &track_list.tracks[index].name)
        .find(|name| !name.is_empty())
        .cloned()
        .unwrap_or_else(|| key.to_string())
}

/// Removes loops with no section left inside them.
fn remove_empty_loops(segments: &mut Vec<Segment>) {
    while let Some(index) = segments.windows(2).position(|pair| {
        matches!(
            pair,
            [Segment::StartLoop { label_index: start, .. }, Segment::EndLoop { label_index: end, .. }]
                if *start as u8 == *end
        )
    }) {
        segments.drain(index..index + 2);
    }
    // An end with no start left before it
    let starts: Vec<u16> = segments
        .iter()
        .filter_map(|segment| match segment {
            Segment::StartLoop { label_index, .. } => Some(*label_index),
            _ => None,
        })
        .collect();
    segments.retain(|segment| match segment {
        Segment::EndLoop { label_index, .. } => starts.contains(&(*label_index as u16)),
        _ => true,
    });
}

#[cfg(test)]
mod test {
    use midly::num::{u4, u7, u15, u24, u28};
    use midly::{Header, MetaMessage, MidiMessage, Smf, Timing, TrackEvent, TrackEventKind};

    use super::*;

    /// A MIDI event at a tick, at 48 ticks per beat like the game.
    enum Ev {
        Note(u32, u8, u32),
    }

    /// Writes a MIDI file: a master track holding `markers`, then each track named and holding its events.
    fn midi(tracks: &[(&'static str, Vec<(u32, Ev)>)], markers: &[(u32, &'static str)]) -> Vec<u8> {
        fn finish(mut events: Vec<(u32, TrackEventKind<'static>)>) -> Vec<TrackEvent<'static>> {
            events.sort_by_key(|(tick, kind)| {
                (
                    *tick,
                    !matches!(
                        kind,
                        TrackEventKind::Midi {
                            message: MidiMessage::NoteOff { .. },
                            ..
                        }
                    ),
                )
            });
            let mut last = 0;
            let mut track: Vec<TrackEvent> = events
                .into_iter()
                .map(|(tick, kind)| {
                    let delta = tick - last;
                    last = tick;
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
        }

        let mut master = vec![(0, TrackEventKind::Meta(MetaMessage::Tempo(u24::new(500_000))))];
        for (tick, text) in markers {
            master.push((*tick, TrackEventKind::Meta(MetaMessage::Marker(text.as_bytes()))));
        }
        let mut all = vec![finish(master)];

        for (index, (name, events)) in tracks.iter().enumerate() {
            let channel = u4::new(index as u8);
            let midi = |message| TrackEventKind::Midi { channel, message };
            let mut track = vec![(0, TrackEventKind::Meta(MetaMessage::TrackName(name.as_bytes())))];
            for (tick, event) in events {
                match event {
                    Ev::Note(pitch, vel, len) => {
                        let key = u7::new(*pitch as u8);
                        track.push((
                            *tick,
                            midi(MidiMessage::NoteOn {
                                key,
                                vel: u7::new(*vel),
                            }),
                        ));
                        track.push((*tick + *len, midi(MidiMessage::NoteOff { key, vel: u7::new(0) })));
                    }
                }
            }
            all.push(finish(track));
        }

        let smf = Smf {
            header: Header::new(midly::Format::Parallel, Timing::Metrical(u15::new(48))),
            tracks: all,
        };
        let mut bytes = Vec::new();
        smf.write_std(&mut bytes).unwrap();
        bytes
    }

    fn notes(pitches: &[(u32, u32)]) -> Vec<(u32, Ev)> {
        pitches
            .iter()
            .map(|(tick, pitch)| (*tick, Ev::Note(*pitch, 100, 24)))
            .collect()
    }

    /// Saves and reopens the song, as the editor does, returning it and its rebuilt last import.
    fn save_and_open(bgm: &Bgm, base: &Timeline) -> (Bgm, Option<Timeline>) {
        let mut saved = bgm.clone();
        saved.import = with_patch(bgm, base);
        let opened = Bgm::from_bytes(&saved.as_bytes().unwrap()).unwrap();
        let base = rebuild_base(&opened);
        (opened, base)
    }

    /// The pitches of the notes on the song's track with key `key`, by tick.
    fn played(bgm: &Bgm, key: &str) -> Vec<(u32, u8)> {
        let keys = &bgm.import.as_ref().unwrap().track_keys;
        let timeline = timeline(bgm, keys).unwrap();
        let mut played: Vec<(u32, u8)> = timeline
            .get(key)
            .into_iter()
            .flatten()
            .filter_map(|timed| match timed.command {
                Command::Note { pitch, .. } => Some((timed.tick, pitch - 104)),
                _ => None,
            })
            .collect();
        played.sort();
        played
    }

    fn track_index(bgm: &Bgm, key: &str) -> usize {
        let keys = &bgm.import.as_ref().unwrap().track_keys;
        keys.iter().position(|k| k.as_deref() == Some(key)).unwrap()
    }

    /// Edits a track in the song's first section.
    fn edit(bgm: &mut Bgm, key: &str, change: impl FnOnce(&mut CommandSeq)) {
        let index = track_index(bgm, key);
        let Segment::Subseg { track_list, .. } = bgm.variations[0].as_ref().unwrap().segments[0] else {
            panic!()
        };
        change(&mut bgm.track_lists.get_mut(&track_list).unwrap().tracks[index].commands);
    }

    fn remove_note(seq: &mut CommandSeq, pitch: u8) {
        let index = seq
            .iter()
            .position(|event| matches!(event.command, Command::Note { pitch: p, .. } if p == pitch + 104))
            .unwrap();
        seq.clear_command(index);
    }

    fn subsegs(bgm: &Bgm) -> Vec<&'static str> {
        bgm.variations[0]
            .as_ref()
            .unwrap()
            .segments
            .iter()
            .map(|segment| match segment {
                Segment::Subseg { .. } => "section",
                Segment::StartLoop { .. } => "loop start",
                Segment::EndLoop { iter_count: 0, .. } => "loop end",
                _ => "other",
            })
            .collect()
    }

    #[test]
    fn import_links_tracks_by_name() {
        let raw = midi(&[("Lead", notes(&[(0, 60)])), ("Bass", notes(&[(0, 36)]))], &[]);
        let imported = import(&raw, "song.mid", MidiMapping::PaperMario, &[]).unwrap();
        let link = imported.bgm.import.as_ref().unwrap();
        assert_eq!(link.track_keys[0].as_deref(), Some("master"));
        assert_eq!(link.track_keys[1].as_deref(), Some("Lead"));
        assert_eq!(link.track_keys[2].as_deref(), Some("Bass"));
        assert_eq!(link.track_keys[3], None);
        assert_eq!(link.source_name, "song.mid");
    }

    #[test]
    fn import_puts_drums_last_and_reimport_finds_them() {
        let v1 = midi(
            &[
                ("Drums", notes(&[(0, 36)])),
                ("Lead", notes(&[(0, 60)])),
                ("Bass", notes(&[(0, 36)])),
            ],
            &[],
        );
        let imported = import(&v1, "song.mid", MidiMapping::PaperMario, &[]).unwrap();
        let link = imported.bgm.import.as_ref().unwrap();
        assert_eq!(link.track_keys[1].as_deref(), Some("Lead"));
        assert_eq!(link.track_keys[2].as_deref(), Some("Bass"));
        assert_eq!(link.track_keys[3].as_deref(), Some("Drums"));
        let Segment::Subseg { track_list, .. } = imported.bgm.variations[0].as_ref().unwrap().segments[0] else {
            panic!()
        };
        assert!(imported.bgm.track_lists[&track_list].tracks[3].is_drum_track);

        let v2 = midi(
            &[
                ("Drums", notes(&[(0, 38)])),
                ("Lead", notes(&[(0, 62)])),
                ("Bass", notes(&[(0, 36)])),
            ],
            &[],
        );
        let (bgm, _, _) = reimport(&imported.bgm, Some(&imported.base), &v2, "song.mid", &[]).unwrap();
        assert_eq!(played(&bgm, "Lead"), vec![(0, 62)]);
        assert_eq!(played(&bgm, "Drums"), vec![(0, 38)]);
    }

    #[test]
    fn unedited_song_has_an_empty_patch_and_rebuilds_its_base() {
        let raw = midi(&[("Lead", notes(&[(0, 60), (48, 62), (96, 64)]))], &[]);
        let imported = import(&raw, "song.mid", MidiMapping::PaperMario, &[]).unwrap();
        assert!(
            with_patch(&imported.bgm, &imported.base)
                .unwrap()
                .patch
                .tracks
                .is_empty()
        );

        let (_, base) = save_and_open(&imported.bgm, &imported.base);
        assert_eq!(base.as_ref(), Some(&imported.base));
    }

    #[test]
    fn edited_song_rebuilds_its_base_after_saving() {
        let raw = midi(&[("Lead", notes(&[(0, 60), (48, 62), (96, 64)]))], &[]);
        let imported = import(&raw, "song.mid", MidiMapping::PaperMario, &[]).unwrap();
        let mut bgm = imported.bgm.clone();
        edit(&mut bgm, "Lead", |seq| {
            remove_note(seq, 62);
            seq.insert_after(72, Command::TrackVolumeFade { time: 24, value: 40 });
        });

        let link = with_patch(&bgm, &imported.base).unwrap();
        assert_eq!(link.patch.tracks.len(), 1);
        assert_eq!(link.patch.tracks[0].removed.len(), 1);
        assert_eq!(link.patch.tracks[0].added.len(), 1);

        let (_, base) = save_and_open(&bgm, &imported.base);
        assert_eq!(base.map(|base| canonical(&base)), Some(canonical(&imported.base)));
    }

    #[test]
    fn small_patch() {
        let raw = midi(&[("Lead", notes(&[(0, 60), (48, 62), (96, 64)]))], &[]);
        let imported = import(&raw, "song.mid", MidiMapping::PaperMario, &[]).unwrap();
        let unedited = rmp_serde::to_vec(imported.bgm.import.as_ref().unwrap()).unwrap();
        assert!(unedited.len() < 100, "{} bytes", unedited.len());

        let mut bgm = imported.bgm.clone();
        edit(&mut bgm, "Lead", |seq| {
            seq.insert_after(24, Command::TrackVolumeFade { time: 24, value: 40 })
        });
        let edited = rmp_serde::to_vec(&with_patch(&bgm, &imported.base).unwrap()).unwrap();
        assert!(
            edited.len() - unedited.len() < 40,
            "{} bytes",
            edited.len() - unedited.len()
        );
    }

    #[test]
    fn links_saved_before_general_midi_read_as_paper_mario_numbers() {
        let saved = rmp_serde::to_vec(&(1u32, "song.mid", 2u32, vec![Some("Lead")], 3u32, Patch::default())).unwrap();
        let link: ImportLink = rmp_serde::from_slice(&saved).unwrap();
        assert_eq!(link.base_hash, 3);
        assert_eq!(link.mapping, MidiMapping::PaperMario);
    }

    #[test]
    fn mamar_edits_survive_a_reimport() {
        let v1 = midi(&[("Lead", notes(&[(0, 60), (48, 62), (96, 64)]))], &[]);
        let imported = import(&v1, "song.mid", MidiMapping::PaperMario, &[]).unwrap();
        let mut bgm = imported.bgm.clone();
        edit(&mut bgm, "Lead", |seq| {
            seq.insert_after(
                108,
                Command::Note {
                    pitch: 72 + 104,
                    velocity: 90,
                    length: 12,
                },
            )
        });
        bgm.instruments[1].volume = 55;
        let (bgm, base) = save_and_open(&bgm, &imported.base);

        // The source changes a note and adds one
        let v2 = midi(&[("Lead", notes(&[(0, 60), (48, 65), (96, 64), (144, 67)]))], &[]);
        let (bgm, _, report) = reimport(&bgm, base.as_ref(), &v2, "song.mid", &[]).unwrap();

        assert_eq!(
            played(&bgm, "Lead"),
            vec![(0, 60), (48, 65), (96, 64), (108, 72), (144, 67)]
        );
        assert_eq!(bgm.instruments[1].volume, 55);
        assert!(report.problems.is_empty(), "{:?}", report.problems);
    }

    #[test]
    fn source_wins_when_both_change_a_note() {
        let v1 = midi(&[("Lead", notes(&[(0, 60), (48, 62)]))], &[]);
        let imported = import(&v1, "song.mid", MidiMapping::PaperMario, &[]).unwrap();
        let mut bgm = imported.bgm.clone();
        edit(&mut bgm, "Lead", |seq| {
            remove_note(seq, 62);
            seq.insert_after(
                48,
                Command::Note {
                    pitch: 62 + 104,
                    velocity: 30,
                    length: 24,
                },
            );
        });
        // The same note, longer
        let v2 = midi(
            &[("Lead", vec![(0, Ev::Note(60, 100, 24)), (48, Ev::Note(62, 100, 40))])],
            &[],
        );
        let (bgm, _, report) = reimport(&bgm, Some(&imported.base), &v2, "song.mid", &[]).unwrap();

        assert_eq!(played(&bgm, "Lead"), vec![(0, 60), (48, 62)]);
        assert!(
            report.problems.iter().any(|problem| problem.contains("overwritten")),
            "{:?}",
            report.problems
        );
    }

    #[test]
    fn mamar_setup_wins() {
        let v1 = midi(&[("Lead", notes(&[(0, 60)]))], &[]);
        let imported = import(&v1, "song.mid", MidiMapping::PaperMario, &[]).unwrap();
        let mut bgm = imported.bgm.clone();
        edit(&mut bgm, "Lead", |seq| {
            let index = seq
                .iter()
                .position(|event| matches!(event.command, Command::SubTrackVolume(_)))
                .unwrap();
            seq.clear_command(index);
            seq.insert_after(0, Command::SubTrackVolume(20));
        });
        let v2 = midi(&[("Lead", notes(&[(0, 62)]))], &[]);
        let (bgm, _, _) = reimport(&bgm, Some(&imported.base), &v2, "song.mid", &[]).unwrap();
        let keys = bgm.import.as_ref().unwrap().track_keys.clone();
        let volumes: Vec<Command> = timeline(&bgm, &keys).unwrap()["Lead"]
            .iter()
            .filter(|timed| matches!(timed.command, Command::SubTrackVolume(_)))
            .map(|timed| timed.command.clone())
            .collect();
        assert_eq!(volumes, vec![Command::SubTrackVolume(20)]);
    }

    #[test]
    fn tracks_added_and_removed() {
        let v1 = midi(&[("Lead", notes(&[(0, 60)])), ("Bass", notes(&[(0, 36)]))], &[]);
        let imported = import(&v1, "song.mid", MidiMapping::PaperMario, &[]).unwrap();
        let v2 = midi(&[("Lead", notes(&[(0, 60)])), ("Pad", notes(&[(0, 48)]))], &[]);
        let (bgm, _, report) = reimport(&imported.bgm, Some(&imported.base), &v2, "song.mid", &[]).unwrap();

        let keys = &bgm.import.as_ref().unwrap().track_keys;
        assert!(!keys.contains(&Some("Bass".to_string())));
        assert_eq!(played(&bgm, "Pad"), vec![(0, 48)]);
        assert_ne!(track_index(&bgm, "Pad"), 2, "the removed track keeps its slot");
        assert!(report.problems.iter().any(|problem| problem.contains("Bass")));
    }

    #[test]
    fn unchanged_file() {
        let raw = midi(&[("Lead", notes(&[(0, 60)]))], &[]);
        let imported = import(&raw, "song.mid", MidiMapping::PaperMario, &[]).unwrap();
        let (_, _, report) = reimport(&imported.bgm, Some(&imported.base), &raw, "song.mid", &[]).unwrap();
        assert!(report.unchanged);
    }

    #[test]
    fn markers_make_sections_and_loops() {
        let raw = midi(
            &[("Lead", notes(&[(0, 60), (96, 62), (192, 64), (288, 65)]))],
            &[(96, "Loop start"), (192, "section"), (288, "loop end")],
        );
        let imported = import(&raw, "song.mid", MidiMapping::PaperMario, &[]).unwrap();
        assert_eq!(
            subsegs(&imported.bgm),
            vec!["section", "loop start", "section", "section", "loop end", "section"]
        );
        assert_eq!(
            played(&imported.bgm, "Lead"),
            vec![(0, 60), (96, 62), (192, 64), (288, 65)]
        );

        let (_, base) = save_and_open(&imported.bgm, &imported.base);
        assert_eq!(base.as_ref(), Some(&imported.base));
    }

    #[test]
    fn sections_made_in_mamar_are_kept() {
        let v1 = midi(&[("Lead", notes(&[(0, 60), (96, 62)]))], &[]);
        let imported = import(&v1, "song.mid", MidiMapping::PaperMario, &[]).unwrap();
        let mut bgm = imported.bgm.clone();
        bgm.split_variation_at(0, 96);
        let (bgm, base) = save_and_open(&bgm, &imported.base);
        assert!(base.is_some());

        let v2 = midi(&[("Lead", notes(&[(0, 60), (96, 63), (192, 65)]))], &[]);
        let (bgm, _, _) = reimport(&bgm, base.as_ref(), &v2, "song.mid", &[]).unwrap();
        assert_eq!(subsegs(&bgm), vec!["section", "section"]);
        assert_eq!(played(&bgm, "Lead"), vec![(0, 60), (96, 63), (192, 65)]);
    }

    #[test]
    fn tracks_made_in_mamar_are_kept() {
        let v1 = midi(&[("Lead", notes(&[(0, 60), (48, 62)]))], &[]);
        let imported = import(&v1, "song.mid", MidiMapping::PaperMario, &[]).unwrap();
        let mut bgm = imported.bgm.clone();
        let Segment::Subseg { track_list, .. } = bgm.variations[0].as_ref().unwrap().segments[0] else {
            panic!()
        };
        let alternate = &mut bgm.track_lists.get_mut(&track_list).unwrap().tracks[5];
        alternate.alternate_for = Some(1);
        alternate.commands = vec![Command::Note {
            pitch: 70 + 104,
            velocity: 80,
            length: 24,
        }]
        .into();

        let v2 = midi(&[("Lead", notes(&[(0, 61), (48, 62)]))], &[]);
        let (bgm, _, _) = reimport(&bgm, Some(&imported.base), &v2, "song.mid", &[]).unwrap();
        let track = &bgm.track_lists[&track_list].tracks[5];
        assert_eq!(track.alternate_for, Some(1));
        assert!(
            track
                .commands
                .iter()
                .any(|event| matches!(event.command, Command::Note { pitch, .. } if pitch == 70 + 104))
        );
        assert_eq!(played(&bgm, "Lead"), vec![(0, 61), (48, 62)]);
    }

    #[test]
    fn tracks_varying_by_mix_are_left_alone() {
        let v1 = midi(&[("Lead", notes(&[(0, 60), (48, 62)]))], &[]);
        let imported = import(&v1, "song.mid", MidiMapping::PaperMario, &[]).unwrap();
        let mut bgm = imported.bgm.clone();
        let Segment::Subseg { track_list, .. } = bgm.variations[0].as_ref().unwrap().segments[0] else {
            panic!()
        };
        let mut branches = bgm.branches.clone();
        bgm.track_lists.get_mut(&track_list).unwrap().tracks[1]
            .commands
            .vary_by_mix(&mut branches, 48, 2, false);
        bgm.branches = branches;
        let before = bgm.track_lists[&track_list].tracks[1].commands.clone();

        let v2 = midi(&[("Lead", notes(&[(0, 61), (48, 62)]))], &[]);
        let (after, _, report) = reimport(&bgm, Some(&imported.base), &v2, "song.mid", &[]).unwrap();
        assert_eq!(after.track_lists[&track_list].tracks[1].commands, before);
        assert!(
            report.problems.iter().any(|problem| problem.contains("proximity mix")),
            "{:?}",
            report.problems
        );
    }

    #[test]
    fn markers_in_the_new_file_set_the_sections() {
        let v1 = midi(&[("Lead", notes(&[(0, 60), (96, 62)]))], &[]);
        let imported = import(&v1, "song.mid", MidiMapping::PaperMario, &[]).unwrap();
        let v2 = midi(
            &[("Lead", notes(&[(0, 60), (96, 62), (192, 64)]))],
            &[(96, "loop start"), (192, "loop end")],
        );
        let (bgm, base, _) = reimport(&imported.bgm, Some(&imported.base), &v2, "song.mid", &[]).unwrap();
        assert_eq!(
            subsegs(&bgm),
            vec!["section", "loop start", "section", "loop end", "section"]
        );
        assert_eq!(played(&bgm, "Lead"), vec![(0, 60), (96, 62), (192, 64)]);

        // Nothing changed in Mamar since, so the patch is empty
        assert!(with_patch(&bgm, &base).unwrap().patch.tracks.is_empty());
    }

    #[test]
    fn single_track_files_are_split_by_channel() {
        let raw = {
            let note = |channel: u8, key: u8, tick: u32| {
                [
                    (
                        tick,
                        TrackEventKind::Midi {
                            channel: u4::new(channel),
                            message: MidiMessage::NoteOn {
                                key: u7::new(key),
                                vel: u7::new(100),
                            },
                        },
                    ),
                    (
                        tick + 24,
                        TrackEventKind::Midi {
                            channel: u4::new(channel),
                            message: MidiMessage::NoteOff {
                                key: u7::new(key),
                                vel: u7::new(0),
                            },
                        },
                    ),
                ]
            };
            let mut events: Vec<(u32, TrackEventKind)> =
                vec![(0, TrackEventKind::Meta(MetaMessage::Tempo(u24::new(500_000))))];
            events.extend(note(0, 60, 0));
            events.extend(note(9, 36, 0));
            events.sort_by_key(|(tick, _)| *tick);
            let mut last = 0;
            let mut track: Vec<TrackEvent> = events
                .into_iter()
                .map(|(tick, kind)| {
                    let delta = tick - last;
                    last = tick;
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
            let smf = Smf {
                header: Header::new(midly::Format::SingleTrack, Timing::Metrical(u15::new(48))),
                tracks: vec![track],
            };
            let mut bytes = Vec::new();
            smf.write_std(&mut bytes).unwrap();
            bytes
        };
        let imported = import(&raw, "song.mid", MidiMapping::PaperMario, &[]).unwrap();
        assert_eq!(played(&imported.bgm, "ch1"), vec![(0, 60)]);
        assert_eq!(played(&imported.bgm, "ch10"), vec![(0, 36)]);
        let drums = track_index(&imported.bgm, "ch10");
        assert!(imported.bgm.track_lists.values().next().unwrap().tracks[drums].is_drum_track);
    }

    #[test]
    fn rebuild_fails_cleanly_when_the_song_changed_outside_mamar() {
        let raw = midi(&[("Lead", notes(&[(0, 60), (48, 62)]))], &[]);
        let imported = import(&raw, "song.mid", MidiMapping::PaperMario, &[]).unwrap();
        let mut saved = imported.bgm.clone();
        saved.import = with_patch(&imported.bgm, &imported.base);
        // Changed without updating the patch, as a recording switch left in by opening without the ROM would
        edit(&mut saved, "Lead", |seq| {
            seq.insert_after(0, Command::TrackVolumeFade { time: 1, value: 1 })
        });
        assert_eq!(rebuild_base(&saved), None);
    }
}
