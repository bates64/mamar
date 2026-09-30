//! Tracks that play a different passage in each proximity mix, as [branches](Command::Branch) do. An editor edits
//! such a track as it plays in one mix at a time: one sequence, with each branch played as that mix's option.

use std::collections::{BTreeMap, HashSet};

use super::*;

/// The option of `branch` that mix `mix` plays: the game plays the first option when the mix has no option.
fn option_for(branch: &Branch, mix: usize) -> Option<&BranchOption> {
    branch.options.get(mix).or(branch.options.first())
}

/// An option's commands before its [Command::End], with detours written out, each with the time it plays at.
fn timed(commands: &CommandSeq) -> (Vec<(usize, Event)>, usize) {
    let mut events = Vec::new();
    let mut time = 0;
    for event in commands.without_detours().iter() {
        match event.command {
            Command::End => break,
            Command::Delay(delay) => time += delay,
            _ => events.push((time, event.clone())),
        }
    }
    (events, time)
}

/// How long `branch` plays in mix `mix`: its option for the mix, or as long as its first option if that's longer.
fn branch_len(branch: &Branch, mix: usize) -> usize {
    let played = option_for(branch, mix).map_or(0, |option| timed(&option.commands).1);
    played.max(branch.len_time())
}

/// Commands that play `events`, each at its time, and then wait until `end`, if given.
fn from_timed(events: impl IntoIterator<Item = (usize, Event)>, end: Option<usize>) -> Vec<Event> {
    let mut commands: Vec<Event> = Vec::new();
    let mut now = 0;
    for (time, event) in events {
        if time > now {
            commands.push(Command::Delay(time - now).into());
            now = time;
        }
        commands.push(event);
    }
    if let Some(end) = end.filter(|&end| end > now) {
        commands.push(Command::Delay(end - now).into());
    }
    commands
}

/// Whether two passages play the same commands at the same times, ignoring event IDs and how waits are split up.
fn plays_same(a: &[(usize, Event)], b: &[(usize, Event)]) -> bool {
    a.len() == b.len()
        && a.iter()
            .zip(b)
            .all(|((ta, a), (tb, b))| ta == tb && a.command == b.command)
}

/// A new branch ID, after every one in `branches`.
fn next_branch_id(branches: &BTreeMap<BranchId, Branch>) -> BranchId {
    branches.keys().next_back().map_or(1, |id| id + 1)
}

/// The events the option of `branch` for mix `mix` plays where the branch command with ID `branch_event` plays it, each
/// with its time. Events the sequence already played, in `seen`, are played as copies with IDs of their own, as detours
/// do, so each can be told apart: a branch can play in several places, and options can share their events.
fn played_option(branch: &Branch, mix: usize, branch_event: Id, seen: &mut HashSet<Id>) -> Vec<(usize, Event)> {
    let (events, _) = option_for(branch, mix).map_or_else(Default::default, |option| timed(&option.commands));
    events
        .into_iter()
        .map(|(time, source)| {
            let id = if seen.contains(&source.id) {
                copy_id(branch_event, source.id)
            } else {
                source.id
            };
            seen.insert(id);
            (
                time,
                Event {
                    id,
                    command: source.command,
                },
            )
        })
        .collect()
}

/// A copy of `commands` with new event IDs.
fn copied(commands: &CommandSeq) -> CommandSeq {
    commands
        .iter()
        .map(|event| Event::from(event.command.clone()))
        .collect()
}

impl CommandSeq {
    /// Whether this sequence branches, so it plays differently in each proximity mix.
    pub fn varies_by_mix(&self) -> bool {
        self.without_detours()
            .iter()
            .any(|event| matches!(event.command, Command::Branch { .. }))
    }

    /// The commands this sequence plays in proximity mix `mix`, with detours written out and each branch replaced by
    /// the commands of its option for the mix. Events keep their IDs, or have IDs of their own where a branch plays
    /// again, so edits to them can be written back with [CommandSeq::set_for_mix].
    pub fn for_mix(&self, branches: &BTreeMap<BranchId, Branch>, mix: usize) -> CommandSeq {
        let mut played: Vec<Event> = Vec::new();
        let mut seen = HashSet::new();
        for event in self.without_detours().iter() {
            let Command::Branch { branch: id } = event.command else {
                if !matches!(event.command, Command::Delay(_)) {
                    seen.insert(event.id);
                }
                played.push(event.clone());
                continue;
            };
            let Some(branch) = branches.get(&id) else { continue };
            let events = played_option(branch, mix, event.id, &mut seen);
            played.extend(from_timed(events, Some(branch_len(branch, mix))));
        }
        played.into()
    }

    /// Writes `played`, this sequence as [CommandSeq::for_mix] gives it for mix `mix` and then edited, back into this
    /// sequence and the options of its branches for the mix. Events this sequence has outside its branches stay
    /// outside them, and other events go in the branch playing at their time. A branch whose option for the mix is
    /// edited is replaced by a copy with the edit, so other places that play the branch, and other mixes, don't
    /// change. Branches nothing plays anymore are left in `branches`.
    pub fn set_for_mix(&mut self, branches: &mut BTreeMap<BranchId, Branch>, mix: usize, played: &CommandSeq) {
        let original = self.without_detours();

        // Where each branch plays: its time, length, ID, the ID of the command that plays it there, and the IDs its
        // events have there, as [CommandSeq::for_mix] gives them. And which events are outside the branches.
        let mut regions: Vec<(usize, usize, BranchId, Id, HashSet<Id>)> = Vec::new();
        let mut outside: HashSet<Id> = HashSet::new();
        let mut seen = HashSet::new();
        let mut time = 0;
        for event in original.iter() {
            match event.command {
                Command::Delay(delay) => time += delay,
                Command::Branch { branch: id } => {
                    let Some(branch) = branches.get(&id) else { continue };
                    let len = branch_len(branch, mix);
                    let ids = played_option(branch, mix, event.id, &mut seen)
                        .into_iter()
                        .map(|(_, event)| event.id)
                        .collect();
                    regions.push((time, len, id, event.id, ids));
                    time += len;
                }
                _ => {
                    seen.insert(event.id);
                    outside.insert(event.id);
                }
            }
        }

        // Events of a branch's option stay in it, even at its end, where the next branch starts
        let in_branch = |event: Id, region: &(usize, usize, BranchId, Id, HashSet<Id>)| region.4.contains(&event);

        // Share out the played events
        let mut outer: Vec<(usize, Event)> = Vec::new();
        let mut inner: Vec<Vec<(usize, Event)>> = vec![Vec::new(); regions.len()];
        let mut time = 0;
        for event in played.iter() {
            match event.command {
                Command::Delay(delay) => time += delay,
                _ if outside.contains(&event.id) => outer.push((time, event.clone())),
                _ => match regions
                    .iter()
                    .position(|region| in_branch(event.id, region) && time >= region.0 && time <= region.0 + region.1)
                    .or_else(|| {
                        regions
                            .iter()
                            .position(|&(start, len, ..)| time >= start && time < start + len)
                    }) {
                    Some(region) => inner[region].push((time - regions[region].0, event.clone())),
                    None => outer.push((time, event.clone())),
                },
            }
        }

        // Keep each branch whose option for the mix is unchanged, and copy the others with the edit
        let mut timed_branches: Vec<(usize, usize, Event)> = Vec::new();
        for ((start, len, id, branch_event, _), events) in regions.into_iter().zip(inner) {
            let branch = &branches[&id];
            let unchanged =
                option_for(branch, mix).is_some_and(|option| plays_same(&timed(&option.commands).0, &events));
            let id = if unchanged {
                id
            } else {
                let mut edited = branch.clone();
                edited.pos = None;
                while edited.options.len() <= mix {
                    let first = edited.options.first().cloned().unwrap_or_default();
                    edited.options.push(BranchOption {
                        commands: copied(&first.commands),
                        pos: None,
                        ..first
                    });
                }
                let option = &mut edited.options[mix];
                let mut commands = from_timed(events, Some(len));
                commands.push(Command::End.into());
                option.commands = commands.into();
                option.pos = None;
                let new_id = next_branch_id(branches);
                branches.insert(new_id, edited);
                new_id
            };
            // The command keeps its ID, so the events it plays keep theirs
            timed_branches.push((
                start,
                len,
                Event {
                    id: branch_event,
                    command: Command::Branch { branch: id },
                },
            ));
        }

        // Each event with its time, its place in the order, and how long it plays: a branch plays for its length.
        // Events at the same time keep the order they had, and new ones go after.
        let mut merged: Vec<(usize, usize, usize, Event)> = Vec::new();
        let order: Vec<Id> = original.iter().map(|event| event.id).collect();
        let rank = |event: &Event| order.iter().position(|&id| id == event.id).unwrap_or(usize::MAX);
        let mut branch_ranks = original
            .iter()
            .enumerate()
            .filter(|(_, event)| matches!(event.command, Command::Branch { .. }))
            .map(|(i, _)| i);
        for (time, len, event) in timed_branches {
            merged.push((time, branch_ranks.next().unwrap_or(usize::MAX), len, event));
        }
        for (time, event) in outer {
            merged.push((time, rank(&event), 0, event));
        }
        merged.sort_by_key(|&(time, rank, _, _)| (time, rank));
        let mut commands: Vec<Event> = Vec::new();
        let mut now = 0;
        for (time, _, len, event) in merged {
            if time > now {
                commands.push(Command::Delay(time - now).into());
                now = time;
            }
            commands.push(event);
            now += len;
        }
        *self = commands.into();
    }

    /// Makes this sequence play a different passage in each of `mixes` proximity mixes, changing between them every
    /// `interval` ticks: every mix plays what it plays now until it's edited. The track plays drums in every mix if
    /// `is_drum_track`.
    pub fn vary_by_mix(
        &mut self,
        branches: &mut BTreeMap<BranchId, Branch>,
        interval: usize,
        mixes: usize,
        is_drum_track: bool,
    ) {
        let (events, end) = timed(self);
        let interval = interval.max(1);
        let mut commands: Vec<Event> = Vec::new();
        // An empty sequence still gets a branch, so each mix can be given something to play
        let end = if end == 0 { interval } else { end };
        let mut start = 0;
        while start < end {
            let len = interval.min(end - start);
            let last = start + len >= end;
            let in_region: Vec<(usize, Event)> = events
                .iter()
                .filter(|(time, _)| *time >= start && (*time < start + len || last))
                .map(|(time, event)| (time - start, event.clone()))
                .collect();
            let mut first = from_timed(in_region, Some(len));
            first.push(Command::End.into());
            let first: CommandSeq = first.into();
            let options = (0..mixes.max(1))
                .map(|mix| BranchOption {
                    is_drum_track,
                    commands: if mix == 0 { first.clone() } else { copied(&first) },
                    pos: None,
                })
                .collect();
            let id = next_branch_id(branches);
            branches.insert(id, Branch { pos: None, options });
            commands.push(Command::Branch { branch: id }.into());
            start += len;
        }
        commands.push(Command::End.into());
        *self = commands.into();
    }
}

impl Bgm {
    /// How many proximity mixes the song's branches choose between.
    pub fn mix_count(&self) -> usize {
        self.branches
            .values()
            .map(|branch| branch.options.len())
            .max()
            .unwrap_or(0)
    }

    /// Adds a proximity mix, which plays what each branch's first option plays until it's edited.
    pub fn add_mix(&mut self) {
        let mixes = self.mix_count();
        for branch in self.branches.values_mut() {
            while branch.options.len() <= mixes {
                let first = branch.options.first().cloned().unwrap_or_default();
                branch.options.push(BranchOption {
                    commands: copied(&first.commands),
                    pos: None,
                    ..first
                });
            }
            branch.pos = None;
        }
    }

    /// Removes proximity mix `mix`: each branch's option for it, and its name, so the mixes after it take its place.
    /// Once one mix is left, the tracks that varied by mix play it without branching.
    pub fn remove_mix(&mut self, mix: usize) {
        for branch in self.branches.values_mut() {
            if mix < branch.options.len() && branch.options.len() > 1 {
                branch.options.remove(mix);
                branch.pos = None;
            }
        }
        self.mix_names = std::mem::take(&mut self.mix_names)
            .into_iter()
            .filter(|&(other, _)| other as usize != mix)
            .map(|(other, name)| (if other as usize > mix { other - 1 } else { other }, name))
            .collect();

        if self.mix_count() <= 1 {
            let branches = self.branches.clone();
            for track in self
                .track_lists
                .values_mut()
                .flat_map(|track_list| track_list.tracks.iter_mut())
            {
                if !track.commands.varies_by_mix() {
                    continue;
                }
                let first = track
                    .commands
                    .without_detours()
                    .iter()
                    .find_map(|event| match event.command {
                        Command::Branch { branch } => branches.get(&branch).and_then(|branch| branch.options.first()),
                        _ => None,
                    })
                    .map(|option| option.is_drum_track);
                track.is_drum_track = first.unwrap_or(track.is_drum_track);
                track.commands = track.commands.for_mix(&branches, 0);
                track.pos = None;
            }
            self.mix_names.clear();
        }
        self.remove_unplayed_branches();
    }

    /// Removes branches that no track plays.
    pub fn remove_unplayed_branches(&mut self) {
        let played: HashSet<BranchId> = self
            .track_lists
            .values()
            .flat_map(|track_list| track_list.tracks.iter())
            .flat_map(|track| track.commands.iter())
            .filter_map(|event| match event.command {
                Command::Branch { branch } => Some(branch),
                _ => None,
            })
            .collect();
        self.branches.retain(|id, _| played.contains(id));
    }
}

#[cfg(test)]
mod test {
    use std::io::Cursor;

    use super::*;

    fn toad_town() -> Bgm {
        Bgm::decode(&mut Cursor::new(include_bytes!("../../tests/bin/Toad_Town_00.bin"))).unwrap()
    }

    fn layer(bgm: &Bgm) -> &Track {
        &bgm.track_lists.values().nth(1).unwrap().tracks[8]
    }

    #[test]
    fn writing_back_unedited_changes_nothing() {
        let mut bgm = toad_town();
        let original = bgm.clone();
        for mix in 0..10 {
            let track_list = bgm.track_lists.values_mut().nth(1).unwrap();
            let track = &mut track_list.tracks[8];
            let played = track.commands.for_mix(&bgm.branches, mix);
            track.commands.set_for_mix(&mut bgm.branches, mix, &played);
        }
        assert_eq!(bgm.branches, original.branches);
        assert!(layer(&bgm).commands.commands_eq(&layer(&original).commands));
    }

    #[test]
    fn each_place_a_branch_plays_has_events_of_its_own() {
        let bgm = toad_town();
        for track in bgm.track_lists.values().flat_map(|track_list| track_list.tracks.iter()) {
            for mix in 0..bgm.mix_count() {
                let played = track.commands.for_mix(&bgm.branches, mix);
                let ids: Vec<Id> = played
                    .iter()
                    .filter(|event| !matches!(event.command, Command::Delay(_)))
                    .map(|event| event.id)
                    .collect();
                assert_eq!(ids.len(), ids.iter().collect::<HashSet<_>>().len(), "mix {mix}");
            }
        }
    }

    #[test]
    fn editing_one_place_copies_only_its_branch() {
        let mut bgm = toad_town();
        let original = bgm.clone();
        let mix = 3;
        let track_list = bgm.track_lists.values_mut().nth(1).unwrap();
        let track = &mut track_list.tracks[8];
        let mut played = track.commands.for_mix(&bgm.branches, mix);
        played.insert_after(
            10,
            Command::Note {
                pitch: 160,
                velocity: 100,
                length: 10,
            },
        );
        track.commands.set_for_mix(&mut bgm.branches, mix, &played);

        assert_eq!(bgm.branches.len(), original.branches.len() + 1);
        let track = layer(&bgm);
        assert_eq!(
            track.commands.for_mix(&bgm.branches, mix).len_time(),
            layer(&original).commands.for_mix(&original.branches, mix).len_time()
        );
        // The first branch played is the copy, and its repeats aren't
        let ids: Vec<BranchId> = track
            .commands
            .iter()
            .filter_map(|event| match event.command {
                Command::Branch { branch } => Some(branch),
                _ => None,
            })
            .collect();
        assert_ne!(ids[0], ids[16]);
        // Other mixes play as they did
        for other in [0, 1, 9] {
            let before = timed(&layer(&original).commands.for_mix(&original.branches, other)).0;
            let after = timed(&track.commands.for_mix(&bgm.branches, other)).0;
            assert!(plays_same(&before, &after), "mix {other} changed");
        }
    }

    #[test]
    fn removing_a_mix_moves_the_ones_after_it_down() {
        let mut bgm = toad_town();
        let original = bgm.clone();
        bgm.mix_names.insert(4, "Four".to_string());
        bgm.remove_mix(3);
        assert_eq!(bgm.mix_count(), 9);
        assert_eq!(bgm.mix_names.get(&3).map(String::as_str), Some("Four"));
        let before = timed(&layer(&original).commands.for_mix(&original.branches, 4)).0;
        let after = timed(&layer(&bgm).commands.for_mix(&bgm.branches, 3)).0;
        assert!(plays_same(&before, &after));
    }

    #[test]
    fn varying_by_mix_plays_the_same_in_every_mix() {
        let mut commands: CommandSeq = vec![
            Command::Note {
                pitch: 160,
                velocity: 100,
                length: 10,
            },
            Command::Delay(200),
            Command::Note {
                pitch: 162,
                velocity: 100,
                length: 10,
            },
            Command::Delay(100),
            Command::End,
        ]
        .into();
        let before = timed(&commands).0;
        let mut branches = BTreeMap::new();
        commands.vary_by_mix(&mut branches, 192, 3, false);
        assert_eq!(branches.len(), 2);
        for mix in 0..3 {
            let after = timed(&commands.for_mix(&branches, mix)).0;
            assert!(plays_same(&before, &after), "mix {mix} differs");
        }
        assert_eq!(commands.for_mix(&branches, 0).len_time(), 300);
    }
}
