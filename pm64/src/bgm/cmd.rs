use std::hash::Hash;
use std::iter;
use std::ops::Range;

use serde_derive::{Deserialize, Serialize};
use typescript_type_def::TypeDef;

use crate::id::{gen_id, Id};

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

        // TODO: combine redundant subsequences (e.g. multiple Delay, multiple MasterTempo without a delay between)

        self.vec.shrink_to_fit();
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
                    dbg!(current_polyphony, time);
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

        let commands = self.vec.split_off(idx + 1); // +1 so that End is left on self
        CommandSeq { vec: commands }
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

/// See audio.h union SeqArgs
/// TODO: rename to use "Variant" and "Seg" prefixes rather than "Seg" and "Sub"; same in audio.h
#[derive(Debug, PartialEq, Eq, Hash, Clone, Serialize, Deserialize, TypeDef)]
pub enum Command {
    /// Stops playback on this track. Note that it is valid to have commands after an `End`; they can be executed
    /// via a [`Detour`](Command::Detour).
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

    /// Sets the composition volume.
    MasterVolume(u8),

    /// Sets the composition transpose value.
    MasterPitchShift {
        cent: u8,
    },

    UnkCmdE3 {
        effect_type: u8,
    },

    /// Fades the tempo to `bpm` across `time` ticks.
    MasterTempoFade {
        time: u16,
        value: u16,
    },

    /// Fades the volume to `volume` across `time` ticks.
    MasterVolumeFade {
        time: u16,
        volume: u8,
    },

    /// Applies the given effect to the entire composition.
    MasterEffect {
        index: u8,
        value: u8,
    },

    // command E7 unused
    /// Sets the bank/patch of this track, overriding its [super::Voice].
    TrackOverridePatch {
        bank: u8,
        patch: u8,
    },

    /// Sets the volume for this track only. Resets at the end of the [super::Subsegment].
    SubTrackVolume(u8),

    /// Left = (+/-)0.
    /// Middle = (+/-)64.
    /// Right = (+/-)127.
    SubTrackPan(i8),

    SubTrackReverb(u8),

    /// Sets the volume for this track only. Resets at the end of the [super::Segment].
    SegTrackVolume(u8),

    SubTrackCoarseTune(u8),

    SubTrackFineTune(u8),

    SegTrackTune {
        bend: i16,
    },

    // TODO: figure out whether Seg or Sub
    TrackTremolo {
        amount: u8,
        speed: u8,
        time: u8,
    },

    TrackTremoloSpeed(u8),

    TrackTremoloTime {
        time: u8,
    },

    TrackTremoloStop,

    UnkCmdF4 {
        pan0: u8,
        pan1: u8,
    },

    SetTrackVoice {
        index: u8,
    },

    TrackVolumeFade {
        time: u16,
        value: u8,
    },

    SubTrackReverbType {
        index: u8,
    },

    // commands F8-FB unused
    Jump {
        unk_00: u16,
        unk_02: u8,
    },

    EventTrigger {
        event_info: u32,
    },

    /// Jumps to the start label and executes until the end label is found.
    Detour {
        start_label: MarkerId,
        end_label: MarkerId, // Must come after
    },

    UnkCmdFF {
        // mode 1: sets effect idx arg1's channel delay to arg2
        // mode 2: resets unk_174 (cmdListPress override data) for id arg1 and sets channel unk_211 (idx of override
        // for mode 3)=arg1
        // mode 3: pushes a cmdListPress command arg1,arg2. if arg1<40 then it looks up opcode in D_80078558
        // mode 4: use override idx arg1
        // mode 5: sets bgmSounds[*].unk_0 = arg1

        // mode 6 is for proximity fade, e.g. the tunnel pipe in toad town
        // mode 6 arg1==0: for all tracks, fades vol to its unk_4F or unk_50 (former if proxMixVolume==127)
        // mode 6 arg1!=0: sets this track's unk_4F=arg1 and unk_50=arg2
        // see also MonitorMusicProximityTrigger api func
        unk_00: u8, // mode
        unk_01: u8,
        unk_02: u8,
    },

    /// Markers don't actually exist in the BGM binary format (rather, it uses command offsets); we use this
    /// abstraction rather than [CommandSeq] indices because they stay stable during mutation.
    Marker {
        label: MarkerId,
    },
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
