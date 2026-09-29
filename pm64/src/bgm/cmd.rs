use std::collections::BTreeMap;
use std::hash::Hash;
use std::iter;
use std::ops::Range;

use serde_derive::{Deserialize, Serialize};
use typescript_type_def::TypeDef;

use crate::{
    bgm::{Branch, BranchId, PatchAddress},
    id::{Id, gen_id},
};

/// A contiguous sequence of [commands](Command) ordered by relative-time.
/// Insertion and lookup is performed via a relative-time key.
///
/// ## Relative-time
///
/// [CommandSeq] does not know its position in absolute time (unlike [Subsegment](crate::Subsegment)), so all
/// operations are done in relative-time. This is defined as the number of ticks since the undefined start time of this
/// [CommandSeq].
///
/// Relative-time changes only when you insert a [Delay]..
///
/// ## Time efficiency
///
/// | Method         | Worst-case | Naïve [`Vec<Command>`] | Explanation                                               |
/// | -------------- | ---------- | ---------------------- | --------------------------------------------------------- |
/// | get/lookup     | O(n)       | N/A                    | Must iterate to find insertion point                      |
/// | insert         | O(2n)      | N/A                    | Must iterate to find insertion point and commands to the
/// right must be shifted | | push           | O(1)       | O(1)                   | Same implementation as [Vec]
/// | | remove         | O(1)       | O(n)                   | [Vec] shifts elements, whereas [CommandSeq] replaces with
/// [Command::default] |
///
/// [CommandSeq] is backed by a [`Vec<Command>`] with some domain-specific optimisations and methods. Note, however,
/// that this collection is not equivalent to [Vec] - in many ways it acts more like a
/// [HashMap](std::collections::HashMap) (i.e. a dictionary) with relative-time keys and [Command] values (for
/// example, you cannot lookup by vector index, because ordering is undefined between [Delay] partitions).
#[derive(Debug, Default, PartialEq, Eq, Hash, Clone, Serialize, Deserialize, TypeDef)]
#[serde(transparent)]
pub struct CommandSeq {
    /// List of [Command]s in time order. Sets of [Command]s at the same time value have undefined ordering, so this
    /// is not a public field. Similarly, [CommandSeq] does not [Deref](std::ops::Deref) to the [Vec] it wraps
    /// (which is as close as Rust gets to OOP-style inheritance).
    /// However, a number of [Vec] operations _are_ safe to provide; these are wrapped in the `impl CommandSeq`, such
    /// as [CommandSeq::len].
    vec: Vec<Event>,
    /* TODO: consider implementing this optimisation because get/insert are hot */
    /*
    /// Lookup table (time -> vec index of first command with that time) for avoiding linear searches.
    /// A binary tree is used so it is trivial to find the last time value (i.e. the time of the last Command).
    ///
    /// Interior mutability (RefCell) is needed in order for lookup methods to not require &mut self (which, logically,
    /// doesn't make sense - why would a CommandSeq user need a mutable reference just to perform a lookup?). This will
    /// panic if time_cache is borrowed past the lifetime of a method here, hence, this field is private and must not
    /// have a reference to it leaked.
    time_index_map: RefCell<BTreeMap<usize, usize>>,
    */
}

impl CommandSeq {
    pub fn new() -> Self {
        Self::with_capacity(0)
    }

    /// Inserts the given command at the start of the specified time, keeping the temporal position of all other
    /// commands in the sequence consistent. Has the side-effect of combining an adjacient Delay sequence, similar to
    /// that of [`shrink`](CommandSeq::shrink).
    ///
    /// A delay will also be inserted after the subsequence where required,
    /// with delays after the insertion point combined into one.
    pub fn insert_start(&mut self, time: usize, command: Command) {
        self.insert_many_start(time, iter::once(command))
    }

    /// Consumes the given iterator of commands and inserts them at the start of the subsequence at the specified time.
    /// [Delays](Delay) are adjusted and inserted in order to maintain the time values of commands before and after in
    /// the sequence.
    ///
    /// The order of the inserted subsequence is maintained.
    ///
    /// Has the side-effect of combining delays to the immediate right of the inserted subsequence.
    pub fn insert_many_start<C: Into<Event>, I: IntoIterator<Item = C>>(&mut self, time: usize, subsequence: I) {
        // Turn subsequence members into Commands if they are not already (C: Into<Command>)
        let subsequence = subsequence.into_iter().map(|cmd| cmd.into());

        match self.lookup_delay(time) {
            DelayLookup::Found(delay_index) => {
                // Insert the command immediately after the Delay which introduces `time`.
                let index = delay_index + 1;
                self.vec.splice(
                    index..index, // Remove no elements
                    subsequence,
                );
            }

            DelayLookup::Missing { index, time_at_index } => {
                debug_assert!(time >= time_at_index);

                let mut old_delay_range = index..index;
                let mut delta_time: usize = 0;
                while let Some(Event { command: Delay(t), .. }) = self.vec.get(old_delay_range.end) {
                    old_delay_range.end += 1;
                    delta_time += *t;
                }

                let insert_time = {
                    let before_time = time - time_at_index;
                    let after_time = delta_time.saturating_sub(before_time); // For delta_time = 0
                    (before_time, after_time)
                };

                fn delay(time: usize) -> Box<dyn Iterator<Item = Event>> {
                    if time > 0 {
                        Box::new(iter::once(Command::Delay(time).into()))
                    } else {
                        Box::new(iter::empty())
                    }
                }

                // Vec::splice and using an iterator is more efficient than a naive while loop that inserts delays.
                // See https://stackoverflow.com/questions/28678615.
                self.vec.splice(
                    old_delay_range, // Replace old delays
                    delay(insert_time.0).chain(subsequence).chain(delay(insert_time.1)),
                );
            }
        }
    }

    /// Inserts the given command at the end of specified time, keeping the temporal position of all other commands in
    /// the sequence consistent. Has the side-effect of combining an adjacient Delay sequence, similar to that of
    /// [`shrink`](CommandSeq::shrink).
    ///
    /// A delay will also be inserted after the subsequence where required,
    /// with delays after the insertion point combined into one.
    pub fn insert_end(&mut self, time: usize, command: Command) {
        self.insert_many_end(time, iter::once(command))
    }

    /// Consumes the given iterator of commands and inserts them at the end of the subsequence at the specified time.
    /// [Delays](Delay) are adjusted and inserted in order to maintain the time values of commands before and after in
    /// the sequence.
    ///
    /// The order of the inserted subsequence is maintained.
    ///
    /// Has the side-effect of combining delays to the immediate right of the inserted subsequence.
    pub fn insert_many_end<C: Into<Event>, I: IntoIterator<Item = C>>(&mut self, time: usize, subsequence: I) {
        // Turn subsequence members into Commands if they are not already (C: Into<Command>)
        let subsequence = subsequence.into_iter().map(|cmd| cmd.into());

        match self.lookup_delay(time) {
            DelayLookup::Found(start) => {
                // Find the next delay, which ends `time`, and insert before it.
                let mut index = self.vec.len();
                for (end, Event { command, .. }) in self.vec.iter().enumerate().skip(start + 1) {
                    if let Command::Delay { .. } = command {
                        index = end - 1;
                        break;
                    } else if let Command::End = command {
                        index = end - 1;
                        break;
                    }
                }
                self.vec.splice(
                    index..index, // Remove no elements
                    subsequence,
                );
            }

            DelayLookup::Missing { index, time_at_index } => {
                debug_assert!(time >= time_at_index);

                let mut old_delay_range = index..index;

                for (index, Event { command, .. }) in self.vec.iter().enumerate().skip(index + 1) {
                    if let Command::Delay { .. } = command {
                        old_delay_range = index..index;
                        break;
                    }
                }

                let mut delta_time: usize = 0;
                while let Some(Event { command: Delay(t), .. }) = self.vec.get(old_delay_range.end) {
                    old_delay_range.end += 1;
                    delta_time += *t;
                }

                let insert_time = {
                    let before_time = time - time_at_index;
                    let after_time = delta_time.saturating_sub(before_time); // For delta_time = 0
                    (before_time, after_time)
                };

                fn delay(time: usize) -> Box<dyn Iterator<Item = Event>> {
                    if time > 0 {
                        Box::new(iter::once(Command::Delay(time).into()))
                    } else {
                        Box::new(iter::empty())
                    }
                }

                // Vec::splice and using an iterator is more efficient than a naive while loop that inserts delays.
                // See https://stackoverflow.com/questions/28678615.
                self.vec.splice(
                    old_delay_range, // Replace old delays
                    delay(insert_time.0).chain(subsequence).chain(delay(insert_time.1)),
                );
            }
        }
    }

    /// Returns the commands occurring at the given time, including the terminating Delay command if there is one.
    pub fn at_time(&self, wanted_time: usize) -> Vec<&Event> {
        self.iter_time_groups()
            .find(|&(time, _)| time == wanted_time)
            .map_or(Vec::new(), |(_, subseq)| subseq)
    }

    // TODO: remove

    /// Iterates over the commands in this sequence in time-order.
    pub fn iter(&self) -> std::slice::Iter<'_, Event> {
        self.vec.iter()
    }

    /// Iterates over each command in this sequence annotated with its time relative to the start of the sequence.
    pub fn iter_time(&self) -> TimeIter<'_> {
        TimeIter {
            seq: self.vec.iter(),
            current_time: 0,
        }
    }

    /// Iterates over subsequences of commands that execute at the same time.
    pub fn iter_time_groups(&self) -> TimeGroupIter<'_> {
        TimeGroupIter {
            seq: self.iter_time().peekable(),
        }
    }

    /// Returns how long the sequence plays before its first [Command::End], including the time its
    /// [detours](Command::Detour) and [branches](Command::Branch) play, or None if it has no End.
    pub fn end_time(&self, branches: &BTreeMap<BranchId, Branch>) -> Option<usize> {
        let marker_time = |label: &MarkerId| {
            self.iter_time()
                .find(|(_, event)| matches!(&event.command, Command::Marker { label: l } if l == label))
                .map(|(time, _)| time)
        };

        let mut time = 0;
        for event in self.vec.iter() {
            match &event.command {
                Command::Delay(delay) => time += delay,
                Command::Detour { start_label, end_label } => {
                    if let (Some(start), Some(end)) = (marker_time(start_label), marker_time(end_label)) {
                        time += end.saturating_sub(start);
                    }
                }
                Command::Branch { branch } => time += branches.get(branch).map_or(0, Branch::len_time),
                Command::End => return Some(time),
                _ => {}
            }
        }
        None
    }

    /// Returns the commands the game plays before the first [Command::End], in the order it plays them, following
    /// [detours](Command::Detour). [Branches](Command::Branch) are not followed, but the time they play is counted.
    pub fn playback<'a>(&'a self, branches: &BTreeMap<BranchId, Branch>) -> Vec<PlayedEvent<'a>> {
        let marker_index = |label: &MarkerId| {
            self.vec
                .iter()
                .position(|event| matches!(&event.command, Command::Marker { label: l } if l == label))
        };

        let mut played = Vec::new();
        let mut time = 0;
        for event in &self.vec {
            played.push(PlayedEvent {
                time,
                event,
                in_detour: false,
            });
            match &event.command {
                Command::End => break,
                Command::Delay(delay) => time += delay,
                Command::Branch { branch } => time += branches.get(branch).map_or(0, Branch::len_time),
                Command::Detour { start_label, end_label } => {
                    let (Some(start), Some(end)) = (marker_index(start_label), marker_index(end_label)) else {
                        continue;
                    };
                    for event in self.vec.get(start..end).unwrap_or_default() {
                        played.push(PlayedEvent {
                            time,
                            event,
                            in_detour: true,
                        });
                        if let Command::Delay(delay) = event.command {
                            time += delay;
                        }
                    }
                }
                _ => {}
            }
        }
        played
    }

    /// Returns the relative-time after the last [Command]. Does not account for any final command which extends the
    /// *playback* time (not the relative-time), that is, [Command::Note] (use [CommandSeq::playback_time] to find
    /// this value).
    pub fn len_time(&self) -> usize {
        let mut time = 0;

        for command in self.vec.iter() {
            if let Event {
                command: Delay(delta_time),
                ..
            } = command
            {
                time += *delta_time;
            }
        }

        time
    }

    /// Calculates the time it takes for this [CommandSeq] to finish in terms of audio playback (i.e. when all
    /// notes have stopped).
    ///
    /// Equivalent to [CommandSeq::len_time] for a sequence with no [Command::Note]s.
    pub fn playback_time(&self) -> usize {
        self.iter_time().last().map_or(0, |(time, event)| match event.command {
            Command::Delay(delta) => time + delta,
            Command::Note { length, .. } => time + length as usize,
            _ => time,
        })
    }

    /// See [Vec::with_capacity].
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            vec: Vec::with_capacity(capacity),
        }
    }

    /// Optimises this sequence to take up as little memory as possible whilst still being playback-equivalent (i.e.
    /// sounds the same).
    pub fn shrink(&mut self) {
        // Remove useless commands
        self.vec
            .retain(|event| !matches!(event.command, Command::Delay(0) | Command::Note { length: 0, .. }));

        if self.vec.is_empty() {
            return;
        }

        // Combine contiguous Delay commands
        let mut i = 0;
        while i < self.vec.len() - 1 {
            if let Command::Delay(delay) = self.vec[i].command {
                if let Command::Delay(next_delay) = self.vec[i + 1].command {
                    self.vec[i].command = Command::Delay(delay + next_delay);
                    self.vec.remove(i + 1);
                } else {
                    i += 1;
                }
            } else {
                i += 1;
            }
        }

        // TODO: combine redundant stateful subsequences e.g. MasterTempo .. MasterTempo with no delay inbetween
    }

    /// Appends the given [Command] to the end of the sequence.
    pub fn push<C: Into<Event>>(&mut self, command: C) {
        self.vec.push(command.into())
    }

    /// Returns the number of commands ("length") in the sequence.
    pub fn len(&self) -> usize {
        self.vec.len()
    }

    pub fn is_empty(&self) -> bool {
        self.vec.len() == 0 || (self.vec.len() == 1 && self.vec[0].command == Command::End)
    }

    pub fn pitch_range(&self) -> Range<u8> {
        let mut range = 0..0;

        for cmd in self.iter() {
            if let Event {
                command: Command::Note { pitch, .. },
                ..
            } = cmd
            {
                let pitch = *pitch;

                if pitch < range.start {
                    range.start = pitch;
                }

                if pitch >= range.end {
                    range.end = pitch.saturating_add(1);
                }
            }
        }

        range
    }

    pub fn clear_command(&mut self, idx: usize) {
        self.vec[idx] = Command::Delay(0).into();
    }

    pub fn zero_all_delays(&mut self) {
        for cmd in &mut self.vec {
            if let Event {
                command: Command::Delay(_),
                ..
            } = cmd
            {
                *cmd = Command::Delay(0).into();
            }
        }
    }

    // TODO
    /*
    /// Combines two sequences with the same relative-time space.
    pub fn union<S: Into<CommandSeq>>(&mut self, other: S) {
        todo!()
    }
    */

    /*
    /// Searches this sequence for the given command **by reference**.
    /// ```
    /// # use pm64::bgm::*;
    /// use std::rc::Rc;
    ///
    /// let command = Rc::new(Command::TrackVoice(0));
    ///
    /// let seq: CommandSeq = std::iter::once(command.clone()).collect();
    ///
    /// // `seq` has `command` in it:
    /// assert!(seq.find_ref(&command));
    ///
    /// // But it does not referentially have this other command in it:
    /// let other_command = Rc::new(Command::TrackVoice(0));
    /// assert!(!seq.find_ref(&other_command));
    ///
    /// // Despite the two commands being structurally equal:
    /// assert!(command == other_command);
    /// ```
    pub fn find_ref(&self, command: &Rc<Command>) -> bool {
        self.vec
            .iter()
            .find(|other| Rc::ptr_eq(command, other))
            .is_some()
    }

    /// Determines if two sequences have referential equality.
    /// ```
    /// # use pm64::bgm::*;
    /// let commands = vec![
    ///     Command::TrackVoice(0), Command::Delay(10)
    /// ];
    ///
    /// let a = CommandSeq::from(commands.clone());
    /// let b = CommandSeq::from(commands);
    ///
    /// // `a` and `b` have structural equality:
    /// assert_eq!(a, b);
    ///
    /// // But they don't have referential equality:
    /// assert!(!CommandSeq::eq_ref(&a, &b));
    /// ```
    pub fn eq_ref(a: &CommandSeq, b: &CommandSeq) -> bool {
        // Fail fast if lengths differ
        if a.len() != b.len() {
            return false;
        }

        let pairs = a.vec.iter().zip(b.vec.iter());
        for (a, b) in pairs {
            if !Rc::ptr_eq(a, b) {
                return false;
            }
        }

        true
    }
    */

    /// Performs a search for the [Delay] introducing the given time. `Delay(0)`s are ignored.
    fn lookup_delay(&self, time: usize) -> DelayLookup {
        if time == 0 {
            return DelayLookup::Missing {
                index: 0,
                time_at_index: 0,
            };
        }

        let mut current_time = 0;

        for (index, command) in self.vec.iter().enumerate() {
            if let Event {
                command: Delay(delta_time),
                ..
            } = command
            {
                let time_at_index = current_time;

                // Advance past this Delay.
                current_time += *delta_time;

                if current_time == time {
                    // This Delay introduced the time we want! :)
                    return DelayLookup::Found(index);
                }

                if current_time > time {
                    // This Delay introduced a time *after* the one we're looking up.
                    return DelayLookup::Missing {
                        index, // Inserting at this index would move this Delay right.
                        time_at_index,
                    };
                }
            }
        }

        // We never reached the target time, so inserting a Delay at the end of the vec would introduce it.
        DelayLookup::Missing {
            index: self.vec.len(),
            time_at_index: current_time,
        }
    }

    // TODO
    /*
    fn lookup_delay_cached(&self, time: usize) -> DelayLookup {
        // Attempt cache lookup
        if let Ok(cache) = self.time_cache.try_borrow() {
            if let Some(index) = cache.get(time) {
                // Cache hit!
                let ret = DelayLookup::Found(index);
                debug_assert_eq!(time, ret);
                return ret;
            }
        }

        // TODO: Perform a trivial bounds check to see if time > biggest key in cache

        let index = self.lookup_delay(time);
        // ...

        // TODO: Attempt cache update
    }
    */

    /// Whether both sequences have the same commands, ignoring event IDs.
    pub fn commands_eq(&self, other: &CommandSeq) -> bool {
        self.vec.len() == other.vec.len() && self.vec.iter().zip(&other.vec).all(|(a, b)| a.command == b.command)
    }

    pub fn to_command_vec(self) -> Vec<Command> {
        self.vec.into_iter().map(|e| e.command).collect()
    }

    /// Calculate the maximum number of notes that play at once.
    pub fn max_polyphony(&self) -> u8 {
        let mut polyphony = 0;
        let mut notes = [0; u8::MAX as usize]; // Maps pitch->end_time of played notes
        for (time, event) in self.iter_time() {
            let time = time as u16;

            if let Event {
                command: Command::Note { pitch, length, .. },
                ..
            } = event
            {
                notes[*pitch as usize] = *length + time;

                let current_polyphony = notes.iter().filter(|end_time| **end_time > time).count() as u8;
                if current_polyphony > polyphony {
                    polyphony = current_polyphony;
                }
            }
        }
        polyphony
    }

    /// Splits this sequence at the given time such that self is the 'before `time`' sequence and the returned
    /// sequence is the 'after `time`' sequence. Adjusts Wait commands on the boundaries to keep the sum len_time
    /// the same as before this was called.
    pub fn split_at(&mut self, time: usize) -> CommandSeq {
        // insert_start has all the logic for finding and adjusting Wait commands
        self.insert_start(time, Command::End);

        // Find the End we just inserted
        let Some((idx, _)) = self.vec.iter().enumerate().find(|(_, event)| {
            matches!(
                event,
                Event {
                    command: Command::End,
                    ..
                }
            )
        }) else {
            return Default::default();
        };

        let mut after_time = CommandSeq {
            vec: self.vec.split_off(idx + 1), // +1 so that End is left on self
        };

        // Persist stateful events
        let setup = {
            let mut stateful_events = Vec::new();
            for event in self.vec.iter() {
                if let Event {
                    command:
                        Command::SetTrackVoice { .. }
                        | Command::TrackOverridePatch(_)
                        | Command::SubTrackCoarseTune(_)
                        | Command::SubTrackFineTune(_)
                        | Command::SubTrackPan(_)
                        | Command::SubTrackReverb(_)
                        | Command::SubTrackReverbType { .. }
                        | Command::SubTrackVolume(..)
                        | Command::Marker { .. }, // TODO: only if used
                    ..
                } = event
                {
                    stateful_events.push(event.clone())
                }
            }
            let mut seq = CommandSeq { vec: stateful_events };
            seq.shrink();
            seq.vec
        };
        after_time.insert_many_start(0, setup);
        after_time
    }
}

impl<C: Into<Event>> From<Vec<C>> for CommandSeq {
    fn from(vec: Vec<C>) -> Self {
        let mut new = Self::new();
        new.insert_many_start(0, vec);
        new
    }
}

impl iter::FromIterator<Event> for CommandSeq {
    fn from_iter<T: IntoIterator<Item = Event>>(iter: T) -> Self {
        Self {
            vec: iter.into_iter().collect(),
        }
    }
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
enum DelayLookup {
    /// The index of the [Delay] that introduces the time being looked up. That is, the command (if any) immediately
    /// following this index is at the time being looked up.
    Found(usize),

    /// The index where a Delay should be inserted to introduce the time being looked up.
    Missing { index: usize, time_at_index: usize },
}

#[derive(Debug, PartialEq, Eq, Hash, Clone, Serialize, Deserialize, TypeDef)]
pub struct Event {
    pub id: Id,
    #[serde(flatten)]
    pub command: Command,
}

/// See audio.h union SeqArgs.
#[derive(Debug, PartialEq, Eq, Hash, Clone, Serialize, Deserialize, TypeDef)]
pub enum Command {
    /// Stops playback on this track. Note that it is valid to have commands after an `End`; they can be executed
    /// via a [`Detour`](Command::Detour). Inside a [branch option](BranchOption), returns to the track that branched.
    End,

    /// Sleeps for however many ticks before continuing playback on this track.
    Delay(usize),

    /// Plays a note or drum sound.
    Note {
        pitch: u8,
        velocity: u8,
        length: u16,
    },

    /// Sets the beats-per-minute of the composition.
    MasterTempo(u16),

    /// Sets the composition volume, from 0 to 127.
    MasterVolume(u8),

    /// Transposes every non-drum note by this many semitones.
    MasterPitchShift {
        #[serde(alias = "cent", deserialize_with = "de_i8_or_u8")]
        semitones: i8,
    },

    /// Sets the effect type of the bus the song plays on.
    #[serde(alias = "UnkCmdE3")]
    BusEffect {
        effect_type: u8,
    },

    /// Fades the tempo to `value` beats-per-minute across `time` ticks.
    MasterTempoFade {
        time: u16,
        value: u16,
    },

    /// Fades the volume to `volume` across `time` ticks.
    MasterVolumeFade {
        time: u16,
        volume: u8,
    },

    /// Sets the effect type of effect slot `index`, from 0 to 3. Tracks choose a slot with
    /// [SubTrackReverbType](Command::SubTrackReverbType).
    MasterEffect {
        index: u8,
        value: u8,
    },

    // command E7 unused
    /// Sets the patch of this track, overriding its [super::Instrument].
    TrackOverridePatch(PatchAddress),

    /// Sets the instrument volume for this track, from 0 to 127.
    SubTrackVolume(u8),

    /// Sets the instrument pan for this track, and stops [random panning](Command::SubTrackRandomPan).
    /// Left = 0.
    /// Middle = 64.
    /// Right = 127.
    SubTrackPan(i8),

    /// Sets the instrument reverb for this track, from 0 to 127.
    SubTrackReverb(u8),

    /// Sets the volume for this track, from 0 to 127.
    SegTrackVolume(u8),

    /// Transposes the instrument by this many semitones.
    SubTrackCoarseTune(#[serde(deserialize_with = "de_i8_or_u8")] i8),

    /// Detunes the instrument by this many cents.
    SubTrackFineTune(#[serde(deserialize_with = "de_i8_or_u8")] i8),

    /// Detunes this track by `bend` cents.
    SegTrackTune {
        bend: i16,
    },

    /// Wobbles the pitch of each note this track plays, starting `delay` ticks into the note.
    TrackTremolo {
        #[serde(alias = "amount")]
        delay: u8,
        speed: u8,
        #[serde(alias = "time")]
        depth: u8,
    },

    TrackTremoloSpeed(u8),

    #[serde(alias = "TrackTremoloTime")]
    TrackTremoloDepth {
        #[serde(alias = "time")]
        depth: u8,
    },

    TrackTremoloStop,

    /// Pans each note this track plays up to `amount` either side of `pan`, at random.
    #[serde(alias = "UnkCmdF4")]
    SubTrackRandomPan {
        #[serde(alias = "pan0")]
        pan: u8,
        #[serde(alias = "pan1")]
        amount: u8,
    },

    /// Uses the [instrument](super::Instrument) at `index`, resetting every `Sub*` setting to the instrument's.
    SetTrackVoice {
        index: u8,
    },

    /// Fades the instrument volume for this track to `value` across `time` ticks.
    TrackVolumeFade {
        time: u16,
        value: u8,
    },

    /// Sends this track to the bus of effect slot `index`.
    SubTrackReverbType {
        index: u8,
    },

    // commands F8-FB unused
    /// Plays one of the [options](Branch::options) of a [Branch], chosen by the game's proximity mix, then continues.
    /// Resets the track's tuning, tremolo, random pan, volume fade, custom envelope, and bus.
    Branch {
        branch: BranchId,
    },

    /// Queues a music event for the game to read. Only the lower 24 bits are stored.
    EventTrigger {
        event_info: u32,
    },

    /// Jumps to the start label and executes until the end label is found.
    ///
    /// The file stores the distance between the labels as a byte, so a detour of 256 bytes is stored as 0. The game
    /// treats 0 as a detour that never returns.
    Detour {
        start_label: MarkerId,
        end_label: MarkerId, // Must come after
    },

    /// Delays one stereo channel of effect slot `index`'s bus. `delay` bits 0-3 are the delay time, and bit 4 chooses
    /// the right channel rather than the left. A `delay` of 0 turns the delay off.
    StereoDelay {
        index: u8,
        delay: u8,
    },

    /// Clears custom envelope `index`, from 1 to 8, and makes it the one that
    /// [WriteCustomEnvelope](Command::WriteCustomEnvelope) writes to. Other values stop writing.
    SeekCustomEnvelope {
        index: u8,
    },

    /// Appends a step to the custom envelope being written. A `time` below 40 is an index into the engine's table of
    /// step durations, and the step moves to `value`. Otherwise `time` is an envelope command, such as 0xFC to start a
    /// loop, with `value` as its argument.
    WriteCustomEnvelope {
        time: u8,
        value: u8,
    },

    /// Uses custom envelope `index`, from 1 to 8, when this track presses a note. 0 uses the instrument's envelope.
    UseCustomEnvelope {
        index: u8,
    },

    /// Plays sound effect `sound` from the song's sound list.
    TriggerSound {
        sound: u8,
    },

    /// Sets the volumes this track fades to when the proximity mix is applied: `volume1` when the mix volume is 127,
    /// and `volume2` otherwise. If `volume1` is 0, fades every track to its volumes instead.
    ProxMixOverride {
        volume1: u8,
        volume2: u8,
    },

    /// Markers don't actually exist in the BGM binary format (rather, it uses command offsets); we use this
    /// abstraction rather than [CommandSeq] indices because they stay stable during mutation.
    Marker {
        label: MarkerId,
    },
}

/// Accepts values saved before these fields were signed, when they were stored as 0 to 255.
fn de_i8_or_u8<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<i8, D::Error> {
    use serde::Deserialize;
    let value = i16::deserialize(deserializer)?;
    i8::try_from(value)
        .or_else(|_| u8::try_from(value).map(|value| value as i8))
        .map_err(serde::de::Error::custom)
}

use Command::Delay;

pub const DELAY_MAX: u8 = 0x78;

impl Default for Command {
    /// Returns a no-op command. Cannot be encoded.
    fn default() -> Self {
        Delay(0)
    }
}

/*
impl Command {
    /// Returns a Command iterator producing a series of [Delay] commands in order to reach the specified delta time.
    /// This is required for any delta time greater than [DELAY_MAX] ticks.
    ///
    /// ```
    /// # use pm64::bgm::*;
    /// assert_eq!(Command::delays(20).collect::<Vec<_>>(), vec![Command::Delay(20)]);
    /// assert_eq!(Command::delays(0x100).collect::<Vec<_>>(), vec![Command::Delay(0xFF), Command::Delay(1)]);
    /// ```
    ///
    /// A `delta_time` of zero produces an empty iterator (although any number of `Delay(0)`s would be equivalent).
    /// ```
    /// # use pm64::bgm::*;
    /// assert_eq!(Command::delays(0).count(), 0);
    /// ```
    ///
    /// You can easily insert the series of [Delay] commands into a [CommandSeq] using
    /// [`CommandSeq::insert_many(time, Command::delays(delta_time))`](CommandSeq::insert_many):
    /// ```
    /// # use pm64::bgm::*;
    /// let mut sequence = CommandSeq::new();
    ///
    /// sequence.insert_many(0, Command::delays(0xFF * 5));
    ///
    /// assert_eq!(sequence.len(), 5);
    /// ```
    pub fn delays(delta_time: usize) -> Box<dyn Iterator<Item = Command>> {
        let full_delays = iter::repeat(Command::Delay(DELAY_MAX))
            .take(delta_time / (DELAY_MAX as usize)); // Produce this many full delays

        // Add any remaining time.
        // Note: Box is needed for dynamic dispatch because full_delays and .chain() have different types
        match delta_time % (DELAY_MAX as usize) {
            0 => Box::new(full_delays), // No remaining time to add; delta_time divides cleanly into DELAY_MAX
            remainder => Box::new(
                // Append a single Delay to the iterator
                full_delays.chain(iter::once(Command::Delay(remainder as u8)))
            ),
        }
    }
}
*/

impl From<Command> for Event {
    fn from(command: Command) -> Event {
        Event { id: gen_id(), command }
    }
}

/// A command the game plays, and when. See [CommandSeq::playback].
#[derive(Debug, Clone, Copy)]
pub struct PlayedEvent<'a> {
    pub time: usize,
    pub event: &'a Event,
    /// Whether a [detour](Command::Detour) plays this command.
    pub in_detour: bool,
}

#[derive(Clone)]
pub struct TimeIter<'a> {
    seq: std::slice::Iter<'a, Event>,
    current_time: usize,
}

impl<'a> Iterator for TimeIter<'a> {
    type Item = (usize, &'a Event);

    fn next(&mut self) -> Option<Self::Item> {
        match self.seq.next() {
            Some(command) => {
                let ret = (self.current_time, command);

                if let Event {
                    command: Delay(delta_time),
                    ..
                } = command
                {
                    self.current_time += *delta_time;
                }

                Some(ret)
            }
            None => None,
        }
    }
}

pub struct TimeGroupIter<'a> {
    seq: iter::Peekable<TimeIter<'a>>,
}

impl<'a> Iterator for TimeGroupIter<'a> {
    type Item = (usize, Vec<&'a Event>);

    fn next(&mut self) -> Option<Self::Item> {
        match self.seq.next() {
            Some((time, command)) => {
                let ret = Some((
                    time,
                    iter::once(command)
                        .chain(
                            self.seq
                                .clone()
                                .take_while(move |(t, _)| *t == time)
                                .map(|(_, command)| command),
                        )
                        .collect(),
                ));

                // Because we returned a cloned iterator above (in order to use take_while), we need to advance
                // self.seq past all of the elements returned.
                //
                // See https://stackoverflow.com/questions/31374051
                while self.seq.peek().map_or(false, |(t, _)| *t == time) {
                    // Consume the peeked element
                    self.seq.next();
                }

                ret
            }
            None => None,
        }
    }
}

pub type MarkerId = String;

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn insert_end() {
        let mut seq = CommandSeq::new();
        let note = || Command::Note {
            pitch: 0,
            velocity: 0,
            length: 0,
        };

        seq.insert_many_start(0, vec![note(), note()]);
        seq.insert_many_start(10, vec![note(), note()]);

        seq.insert_end(0, Command::Marker { label: "test1".into() });
        seq.insert_end(10, Command::Marker { label: "test2".into() });
        dbg!(&seq);

        assert!(matches!(seq.vec[2].command, Command::Marker { .. }));

        assert!(matches!(seq.vec.last().unwrap().command, Command::Marker { .. }));
    }

    #[test]
    fn max_polyphony() {
        let seq = CommandSeq::new();
        assert_eq!(seq.max_polyphony(), 0);

        let seq: CommandSeq = vec![Command::Note {
            pitch: 100,
            velocity: 100,
            length: 10,
        }]
        .into();
        assert_eq!(seq.max_polyphony(), 1);

        let seq: CommandSeq = vec![
            Command::Note {
                pitch: 100,
                velocity: 100,
                length: 10,
            },
            Command::Delay(15),
            Command::Note {
                pitch: 100, // same pitch
                velocity: 100,
                length: 10,
            },
        ]
        .into();
        assert_eq!(seq.max_polyphony(), 1);

        let seq: CommandSeq = vec![
            Command::Note {
                pitch: 100,
                velocity: 100,
                length: 10,
            },
            Command::Note {
                pitch: 200,
                velocity: 100,
                length: 10,
            },
        ]
        .into();
        assert_eq!(seq.max_polyphony(), 2);

        let seq: CommandSeq = vec![
            Command::Note {
                pitch: 100,
                velocity: 100,
                length: 10,
            },
            Command::Delay(10), // note should finish
            Command::Note {
                pitch: 200,
                velocity: 100,
                length: 10,
            },
        ]
        .into();
        assert_eq!(seq.max_polyphony(), 1);
    }

    #[test]
    fn playback_follows_detours() {
        let note = |pitch| Command::Note {
            pitch,
            velocity: 100,
            length: 5,
        };
        let seq = CommandSeq::from(vec![
            note(1),
            Command::Delay(10),
            Command::Detour {
                start_label: "A".to_string(),
                end_label: "B".to_string(),
            },
            note(3),
            Command::End,
            Command::Marker { label: "A".to_string() },
            note(2),
            Command::Delay(20),
            Command::Marker { label: "B".to_string() },
        ]);

        let notes: Vec<(usize, u8, bool)> = seq
            .playback(&BTreeMap::new())
            .into_iter()
            .filter_map(|played| match played.event.command {
                Command::Note { pitch, .. } => Some((played.time, pitch, played.in_detour)),
                _ => None,
            })
            .collect();

        assert_eq!(notes, vec![(0, 1, false), (10, 2, true), (30, 3, false)]);
    }

    #[test]
    fn deserialize_previous_names() {
        let commands: Vec<Command> = ron::from_str(
            "[MasterPitchShift(cent: 254), UnkCmdE3(effect_type: 1), SubTrackCoarseTune(244), \
             TrackTremolo(amount: 1, speed: 2, time: 3), TrackTremoloTime(time: 4), UnkCmdF4(pan0: 5, pan1: 6)]",
        )
        .unwrap();

        assert_eq!(
            commands,
            vec![
                Command::MasterPitchShift { semitones: -2 },
                Command::BusEffect { effect_type: 1 },
                Command::SubTrackCoarseTune(-12),
                Command::TrackTremolo {
                    delay: 1,
                    speed: 2,
                    depth: 3,
                },
                Command::TrackTremoloDepth { depth: 4 },
                Command::SubTrackRandomPan { pan: 5, amount: 6 },
            ]
        );
    }

    #[test]
    fn split_at() {
        let mut seq = CommandSeq::from(vec![
            Command::Marker { label: "A".to_string() },
            Command::Delay(5),
            Command::Marker { label: "B".to_string() },
            Command::Delay(5),
            Command::End,
        ]);
        let split = seq.split_at(4);

        assert!(matches!(
            seq.vec[0],
            Event {
                command: Command::Marker { .. },
                ..
            }
        ));
        assert_eq!(seq.len_time(), 4);
        assert_eq!(split.len_time(), 6);
    }
}
