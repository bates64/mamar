use std::iter;
use std::rc::{Rc, Weak};
use smallvec::SmallVec;
use by_address::ByAddress;

/// A contiguous sequence of [commands](Command) ordered by relative-time.
/// Insertion and lookup is performed via a relative-time key.
///
/// ## Relative-time
///
/// [CommandSeq] does not know its position in absolute time (unlike [Subsegment](crate::Subsegment)), so all
/// operations are done in relative-time. This is defined as the number of ticks since the undefined start time of this
/// [CommandSeq].
///
/// Relative-time changes only when you insert a [Delay]:
/// ```
/// use codec::{CommandSeq, Command};
///
/// let mut sequence = CommandSeq::new();
///
/// sequence.push(Command::MasterTempo(120)); // Executed at relative-time 0
/// sequence.push(Command::Delay(50));           // Executed at relative-time 0
/// sequence.push(Command::MasterTempo(80));  // Executed at relative-time 50
/// ```
///
/// ## Time efficiency
///
/// | Method         | Worst-case | Naïve [`Vec<Command>`] | Explanation                                               |
/// | -------------- | ---------- | ---------------------- | --------------------------------------------------------- |
/// | get/lookup     | O(n)       | N/A                    | Must iterate to find insertion point                      |
/// | insert         | O(2n)      | N/A                    | Must iterate to find insertion point and commands to the right must be shifted |
/// | push           | O(1)       | O(1)                   | Same implementation as [Vec]                              |
/// | remove         | O(1)       | O(n)                   | [Vec] shifts elements, whereas [CommandSeq] replaces with [Command::default] |
///
/// [CommandSeq] is backed by a [`Vec<Command>`] with some domain-specific optimisations and methods. Note, however,
/// that this collection is not equivalent to [Vec] - in many ways it acts more like a
/// [HashMap](std::collections::HashMap) (i.e. a dictionary) with relative-time keys and [Command] values (for
/// example, you cannot lookup by vector index, because ordering is undefined between [Delay] partitions).
#[derive(Debug, Default, PartialEq, Eq, Clone)]
pub struct CommandSeq {
    /// List of [Command]s in time order. Sets of [Command]s at the same time value have undefined ordering, so this
    /// is not a public field. Similarly, [CommandSeq] does not [Deref](std::ops::Deref) to the [Vec] it wraps
    /// (which is as close as Rust gets to OOP-style inheritance).
    /// However, a number of [Vec] operations _are_ safe to provide; these are wrapped in the `impl CommandSeq`, such
    /// as [CommandSeq::len].
    vec: Vec<Command>,

    // TODO: consider implementing this optimisation because get/insert are hot
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

    /// Inserts the given command at the specified time, keeping the temporal position of all other commands in the
    /// sequence consistent. Has the side-effect of combining an adjacient Delay sequence, similar to that of
    /// [`shrink`](CommandSeq::shrink).
    ///
    /// ```
    /// # use codec::*;
    /// let mut sequence = CommandSeq::from(vec![
    ///     Command::Delay(10),
    ///     Command::Delay(10),
    ///     Command::Delay(10),
    /// ]);
    ///
    /// sequence.insert(15, Command::MasterTempo(120));
    ///
    /// assert_eq!(sequence, CommandSeq::from(vec![
    ///     Command::Delay(10),
    ///
    ///     Command::Delay(5),         // Inserted automatically to reach t = 15
    ///     Command::MasterTempo(120),
    ///
    ///     Command::Delay(15),        // [Delay(10), Delay(10)] combined and adjusted
    /// ]));
    /// ```
    ///
    /// A delay will also be inserted after the subsequence where required:
    /// ```
    /// # use codec::*;
    /// let mut sequence = CommandSeq::from(vec![
    ///     Command::Delay(40),
    ///     Command::MasterTempo(140),
    /// ]);
    ///
    /// sequence.insert(10, Command::MasterTempo(120));
    ///
    /// assert_eq!(sequence, CommandSeq::from(vec![
    ///     Command::Delay(10),
    ///     Command::MasterTempo(120),
    ///     Command::Delay(30),
    ///     Command::MasterTempo(140),
    /// ]));
    /// ```
    /// Even in extreme cases using very long sets of Delays:
    /// ```
    /// # use codec::*;
    /// let mut sequence = CommandSeq::from(vec![
    ///     Command::Delay(0xFF),
    ///     Command::Delay(0xFF),
    ///     Command::Delay(0xFF),
    /// ]);
    ///
    /// sequence.insert(0x100, Command::MasterTempo(120));
    ///
    /// assert_eq!(sequence, CommandSeq::from(vec![
    ///     Command::Delay(0xFF),
    ///     Command::Delay(0x1),
    ///     Command::MasterTempo(120),
    ///     Command::Delay(0xFF),
    ///     Command::Delay(0xFE),
    /// ]));
    /// ```
    ///
    /// The command is inserted at the **start** of the subequence at `time`. That means that insertion at the same time
    /// in series will result in a backwards result. Most of the time this does not matter, but it might be a source
    /// of playback issues in specific circumstances:
    ///
    /// ```
    /// # use codec::*;
    /// let mut sequence = CommandSeq::new();
    ///
    /// sequence.insert(10, Command::MasterTempo(60));  // (1)
    /// sequence.insert(10, Command::MasterTempo(120)); // (2)
    ///
    /// assert_eq!(sequence, CommandSeq::from(vec![
    ///     Command::Delay(10),        // Inserted during (1)
    ///     Command::MasterTempo(120), // (2)
    ///     Command::MasterTempo(60),  // (1) - Oh no! This overrides (2)!
    /// ]));
    /// ```
    ///
    /// In cases such as the above example, you can use [`insert_many(time)`](CommandSeq::insert_many) to insert a
    /// subsequence whilst preserving its order.
    pub fn insert(&mut self, time: usize, command: Command) {
        self.insert_many(time, iter::once(command))
    }

    /// Consumes the given iterator of commands and inserts them at the start of the subsequence at the specified time.
    /// [Delays](Delay) are adjusted and inserted in order to maintain the time values of commands before and after in
    /// the sequence.
    ///
    /// The order of the inserted subsequence is maintained:
    /// ```
    /// # use codec::*;
    /// let mut sequence = CommandSeq::new();
    ///
    /// sequence.insert_many(10, vec![
    ///     Command::MasterTempo(120),
    ///     Command::MasterTempo(60),
    /// ]);
    ///
    /// assert_eq!(sequence, CommandSeq::from(vec![
    ///     Command::Delay(10),
    ///     Command::MasterTempo(120),
    ///     Command::MasterTempo(60),
    /// ]));
    /// ```
    ///
    /// Has the side-effect of combining delays to the immediate right of the inserted subsequence.
    pub fn insert_many<C: Into<Command>, I: IntoIterator<Item = C>>(&mut self, time: usize, subsequence: I) {
        // Turn subsequence members into Rc<Command> if they are not already
        let subsequence = subsequence.into_iter().map(|cmd| cmd.into());

        match self.lookup_delay(time) {
            DelayLookup::Found(delay_index) => {
                // Insert the command immediately after the Delay which introduces `time`.
                let index = delay_index + 1;
                self.vec.splice(
                    index..index, // Remove no elements
                    subsequence,
                );
            },

            DelayLookup::Missing { index, time_at_index } => {
                debug_assert!(time >= time_at_index);

                let mut old_delay_range = index..index;
                let mut delta_time: usize = 0;
                loop {
                    match self.vec.get(old_delay_range.end) {
                        Some(Delay(t)) => {
                            old_delay_range.end += 1;
                            delta_time += *t as usize;
                        },
                        _ => break,
                    }
                }

                let insert_time = {
                    let before_time = time - time_at_index;
                    let after_time = delta_time.saturating_sub(before_time); // For delta_time = 0
                    (before_time, after_time)
                };

                // Vec::splice and using an iterator is more efficient than a naive while loop that inserts delays.
                // See https://stackoverflow.com/questions/28678615.
                self.vec.splice(
                    old_delay_range, // Replace old delays
                    Command::delays(insert_time.0)
                        .chain(subsequence)
                        .chain(Command::delays(insert_time.1)),
                );
            },
        }
    }

    /// Returns the commands occurring at the given time, including the terminating Delay command if there is one.
    /// ```
    /// # use codec::*;
    ///
    /// let mut sequence = CommandSeq::from(vec![
    ///     Command::MasterTempo(60),
    ///     Command::Delay(30),
    ///     Command::MasterTempo(120),
    ///     Command::Delay(10),
    ///     Command::MasterTempo(80),
    /// ]);
    ///
    /// assert_eq!(sequence.at_time(0),  vec![&Command::MasterTempo(60), &Command::Delay(30)]);
    /// assert_eq!(sequence.at_time(15).len(), 0); // No commands at time = 15
    /// assert_eq!(sequence.at_time(30), vec![&Command::MasterTempo(120), &Command::Delay(10)]);
    /// assert_eq!(sequence.at_time(40), vec![&Command::MasterTempo(80)]); // No Delay, because this is the tail
    ///
    /// sequence.insert(15, Command::MasterTempo(50));
    /// assert_eq!(sequence.at_time(0),  vec![&Command::MasterTempo(60), &Command::Delay(15)]);
    /// assert_eq!(sequence.at_time(15), vec![&Command::MasterTempo(50), &Command::Delay(15)]);
    /// ```
    pub fn at_time<'a>(&'a self, wanted_time: usize) -> Vec<&Command> {
        self.iter_time_groups()
            .find(|&(time, _)| time == wanted_time)
            .map_or(Vec::new(), |(_, subseq)| subseq)
    }

    // TODO: remove

    /// Iterates over the commands in this sequence in time-order.
    pub fn iter<'a>(&'a self) -> std::slice::Iter<'a, Command> {
        self.vec.iter()
    }

    /// Iterates over each command in this sequence annotated with its time relative to the start of the sequence.
    pub fn iter_time<'a>(&'a self) -> TimeIter<'a> {
        TimeIter {
            seq: self.vec.iter(),
            current_time: 0,
        }
    }

    /// Iterates over subsequences of commands that execute at the same time.
    pub fn iter_time_groups<'a>(&'a self) -> TimeGroupIter<'a> {
        TimeGroupIter {
            seq: self.iter_time().peekable(),
        }
    }

    /// Returns the relative-time after the last [Command]. Does not account for any final command which extends the
    /// *playback* time (not the relative-time), that is, [Command::Note] (use [CommandSeq::playback_time] to find
    /// this value).
    ///
    /// ```
    /// # use codec::*;
    /// let mut sequence = CommandSeq::new();
    /// assert_eq!(sequence.len_time(), 0);
    ///
    /// sequence.push(Command::Delay(10));
    /// assert_eq!(sequence.len_time(), 10);
    ///
    /// sequence.push(Command::Delay(10));
    /// sequence.push(Command::Delay(10));
    /// assert_eq!(sequence.len_time(), 30);
    ///
    /// // Wouldn't make sense to do this in practice, but it is valid.
    /// sequence.push(Command::Delay(0));
    /// assert_eq!(sequence.len_time(), 30);
    /// ```
    pub fn len_time(&self) -> usize {
        let mut time = 0;

        for command in self.vec.iter() {
            if let Command::Delay(delta_time) = command {
                time += *delta_time as usize;
            }
        }

        time
    }

    /// Calculates the time it takes for this [CommandSeq] to finish in terms of audio playback (i.e. when all
    /// notes have stopped).
    ///
    /// Equivalent to [CommandSeq::len_time] for a sequence with no [Command::Note]s:
    /// ```
    /// # use codec::*;
    /// let seq: CommandSeq = Command::delays(1000).collect();
    /// assert_eq!(seq.playback_time(), 1000);
    /// assert_eq!(seq.len_time(), 1000);
    /// ```
    ///
    /// An empty sequence has a playback time of zero:
    /// ```
    /// # use codec::*;
    /// assert_eq!(CommandSeq::new().playback_time(), 0);
    /// ```
    pub fn playback_time(&self) -> usize {
        self.iter_time()
            .last()
            .map_or(0, |(time, command)| match *command {
                Command::Delay(delta) => time + delta as usize,
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
        // TODO: remove Delay(0) commands
        // TODO: combine redundant subsequences (e.g. multiple Delay, multiple MasterTempo without a delay between)
        self.vec.shrink_to_fit();
    }

    /// Appends the given [Command] to the end of the sequence.
    pub fn push<C: Into<Command>>(&mut self, command: C) { self.vec.push(command.into()) }

    /// Returns the number of commands ("length") in the sequence.
    pub fn len(&self) -> usize { self.vec.len() }

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
    /// # use codec::*;
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
    /// # use codec::*;
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
            return DelayLookup::Missing { index: 0, time_at_index: 0 };
        }

        let mut current_time = 0;

        for (index, command) in self.vec.iter().enumerate() {
            if let Command::Delay(delta_time) = command {
                let time_at_index = current_time;

                // Advance past this Delay.
                current_time += *delta_time as usize;

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
}

impl From<Vec<Command>> for CommandSeq {
    /// ```
    /// # use codec::*;
    /// assert_eq!({
    ///     CommandSeq::from(vec![Command::Delay(10)])
    /// }, {
    ///     // Construct manually
    ///     let mut sequence = CommandSeq::new();
    ///     sequence.push(Command::Delay(10));
    ///     sequence
    /// });
    /// ```
    fn from(vec: Vec<Command>) -> Self {
        Self { vec }
    }
}

impl iter::FromIterator<Command> for CommandSeq {
    fn from_iter<T: IntoIterator<Item = Command>>(iter: T) -> Self {
        Self { vec: iter.into_iter().collect() }
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

/// A Command (or in MIDI terms, an event) describes operations performed at a particular time and on a particular track
/// during playback, like playing a note or changing the track instrument. CommandSeq are independent of (and therefore do
/// not know of) any likely - but not required - parent structs (such as [CommandSeq] and its parent
/// [Track](crate::Track)) and by extension any properties known only by them, such as the command's absolute and
/// relative time positioning.
#[derive(Debug, PartialEq, Eq, Clone)]
pub enum Command {
    /// Sleeps for however many ticks before continuing playback on this track.
    ///
    /// `Delay(0)` is considered a no-op, but cannot be encoded.
    ///
    /// See [`Command::delays(delta_time)`](Command::delays) to create delays longer than [u8::MAX] ticks.
    Delay(u8), // TODO: use bounded-integer and add None for no-op instead of invalid Delay(0)

    /// Plays a note or drum sound. Non-blocking(?), i.e. does **not** act like a [`Delay(length)`](Command::Delay) and
    /// only continue execution once the note has finished playing.
    Note {
        // TODO: make Pitch type
        pitch: u8,

        // TODO: determine bounds etc and use newtype
        velocity: u8,

        // TODO: determine max value (it's not u16::MAX)
        // I think it's 0xD3FF? TODO use newtype
        length: u16,

        /// Unknown flag.
        flag: bool,
    },

    /// Sets the beats-per-minute of the composition.
    MasterTempo(u16),

    /// Fades the tempo to `bpm` across `time` ticks.
    MasterTempoFade { time: u16, bpm: u16 },

    /// Sets the composition volume.
    MasterVolume(u8),

    /// Fades the volume to `volume` across `time` ticks.
    MasterVolumeFade { time: u16, volume: u8 },

    /// Sets the volume for this track only. Resets at the end of the [Subsegment].
    SubTrackVolume(u8),

    /// Sets the volume for this track only. Resets at the end of the [Segment].
    SegTrackVolume(u8),

    // TODO: figure out whether Seg or Sub
    TrackVolumeFade { time: u16, volume: u8 },

    /// Sets the composition transpose value. It is currently unknown exactly how this adjusts pitch.
    MasterTranspose(i8),

    /// Applies the given effect to the entire composition.
    MasterEffect(u8), // TODO: enum for field

    /// Sets the bank/patch of this track, overriding its [Voice].
    TrackOverridePatch { bank: u8, patch: u8 },

    SubTrackPan(u8), // TODO: better type for field
    SubTrackReverb(u8),
    SubTrackReverbType(u8), // TODO: enum for field

    SubTrackCoarseTune(u8),
    SubTrackFineTune(u8),
    SegTrackTune { coarse: u8, fine: u8 },

    // TODO: figure out whether Seg or Sub
    TrackTremolo { amount: u8, speed: u8, unknown: u8 },
    TrackTremoloStop,

    // TODO: figure out whether Seg or Sub
    /// Sets the track's voice. Field is an index into [Bgm::voices].
    TrackVoice(u8),

    /// Marks a specific place in a [CommandSeq].
    Marker(ByAddress<Rc<Marker>>),

    /// Jumps to the start label and executes until the end label is found.
    Subroutine(CommandRange),

    /// An unknown/unimplemented command.
    Unknown(SmallVec<[u8; 4]>),
}

use Command::Delay;

impl Default for Command {
    /// Returns a no-op command. Cannot be encoded.
    fn default() -> Self {
        Delay(0)
    }
}

impl Command {
    /// Returns a Command iterator producing a series of [Delay] commands in order to reach the specified delta time.
    /// This is required for any delta time greater than [`0xFF`](u8::MAX) ticks (which a [Delay] is unable to hold).
    ///
    /// ```
    /// # use codec::*;
    /// assert_eq!(Command::delays(20).collect::<Vec<_>>(), vec![Command::Delay(20)]);
    /// assert_eq!(Command::delays(0x100).collect::<Vec<_>>(), vec![Command::Delay(0xFF), Command::Delay(1)]);
    /// ```
    ///
    /// A `delta_time` of zero produces an empty iterator (although any number of `Delay(0)`s would be equivalent).
    /// ```
    /// # use codec::*;
    /// assert_eq!(Command::delays(0).count(), 0);
    /// ```
    ///
    /// You can easily insert the series of [Delay] commands into a [CommandSeq] using
    /// [`CommandSeq::insert_many(time, Command::delays(delta_time))`](CommandSeq::insert_many):
    /// ```
    /// # use codec::*;
    /// let mut sequence = CommandSeq::new();
    ///
    /// sequence.insert_many(0, Command::delays(0xFF * 5));
    ///
    /// assert_eq!(sequence.len(), 5);
    /// ```
    pub fn delays(delta_time: usize) -> Box<dyn Iterator<Item = Command>> {
        let full_delays = iter::repeat(Command::Delay(u8::MAX))
            .take(delta_time / (u8::MAX as usize)); // Produce this many full delays

        // Add any remaining time.
        // Note: Box is needed for dynamic dispatch because full_delays and .chain() have different types
        match delta_time % (u8::MAX as usize) {
            0 => Box::new(full_delays), // No remaining time to add; delta_time divides cleanly into u8::MAX
            remainder => Box::new(
                // Append a single Delay to the iterator
                full_delays.chain(iter::once(Command::Delay(remainder as u8)))
            ),
        }
    }
}

#[derive(Clone)]
pub struct TimeIter<'a> {
    seq: std::slice::Iter<'a, Command>,
    current_time: usize,
}

impl<'a> Iterator for TimeIter<'a> {
    type Item = (usize, &'a Command);

    fn next(&mut self) -> Option<Self::Item> {
        match self.seq.next() {
            Some(command) => {
                let ret = (self.current_time, command);

                if let Delay(delta_time) = command {
                    self.current_time += *delta_time as usize;
                }

                Some(ret)
            },
            None => None,
        }
    }
}

pub struct TimeGroupIter<'a> {
    seq: iter::Peekable<TimeIter<'a>>,
}

impl<'a> Iterator for TimeGroupIter<'a> {
    type Item = (usize, Vec<&'a Command>);

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
                                .map(|(_, command)| command)
                        )
                        .collect()
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
            },
            None => None,
        }
    }
}

/// Markers don't actually exist in the BGM binary format (rather, it uses command offsets); we use this abstraction
/// rather than [CommandSeq] indices because they stay stable during mutation.
#[derive(Debug)]
pub struct Marker;

#[derive(Debug, Clone)]
pub struct CommandRange {
    pub name: String,

    // These are Weak<_> so they become None if the relevant Command::Marker is dropped.
    pub(crate) start: Weak<Marker>,
    pub(crate) end: Weak<Marker>, // Must come after `start`
}

impl PartialEq for CommandRange {
    fn eq(&self, other: &Self) -> bool {
        self.name == other.name
            && Weak::ptr_eq(&self.start, &other.start)
            && Weak::ptr_eq(&self.end, &other.end)
    }
}

impl Eq for CommandRange {}
