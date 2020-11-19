use std::iter;

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
/// sequence.push(Command::SetMasterTempo(120)); // Executed at relative-time 0
/// sequence.push(Command::Delay(50));           // Executed at relative-time 0
/// sequence.push(Command::SetMasterTempo(80));  // Executed at relative-time 50
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

    /// Inserts the given command into the start of the subsequence at the specified time, inserting [Delays](Delay)
    /// if required to reach it.
    ///
    /// ```
    /// # use codec::*;
    /// let mut sequence = CommandSeq::from(vec![
    ///     Command::Delay(10),
    ///     Command::Delay(10),
    ///     Command::Delay(10),
    /// ]);
    ///
    /// sequence.insert(15, Command::SetMasterTempo(120));
    ///
    /// assert_eq!(sequence, CommandSeq::from(vec![
    ///     Command::Delay(10),
    ///
    ///     Command::Delay(5), // Inserted automatically to reach t = 15
    ///     Command::SetMasterTempo(120),
    ///
    ///     Command::Delay(10),
    ///     Command::Delay(10),
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
    /// sequence.insert(10, Command::SetMasterTempo(60));  // (1)
    /// sequence.insert(10, Command::SetMasterTempo(120)); // (2)
    ///
    /// assert_eq!(sequence, CommandSeq::from(vec![
    ///     Command::Delay(10),           // Inserted during (1)
    ///     Command::SetMasterTempo(120), // (2)
    ///     Command::SetMasterTempo(60),  // (1) - Oh no! This overrides (2)!
    /// ]));
    /// ```
    ///
    /// In cases such as the above example, you can use [`insert_many(time)`](CommandSeq::insert_many) to insert a
    /// subsequence whilst preserving its order.
    pub fn insert(&mut self, time: usize, command: Command) {
        self.insert_many(time, iter::once(command))
    }

    /// Consumes the given iterator of commands and inserts them at the start of the subsequence at the specified time,
    /// inserting [Delays](Delay) if required to reach it.
    ///
    /// The order of the subsequence is maintained:
    /// ```
    /// # use codec::*;
    /// let mut sequence = CommandSeq::new();
    ///
    /// sequence.insert_many(10, vec![
    ///     Command::SetMasterTempo(120),
    ///     Command::SetMasterTempo(60),
    /// ]);
    ///
    /// assert_eq!(sequence, CommandSeq::from(vec![
    ///     Command::Delay(10),
    ///     Command::SetMasterTempo(120),
    ///     Command::SetMasterTempo(60),
    /// ]));
    /// ```
    pub fn insert_many<I: IntoIterator<Item = Command>>(&mut self, time: usize, subsequence: I) {
        match self.lookup_delay(time) {
            DelayLookup::Found(delay_index) => {
                // Insert the command immediately after the Delay which introduces `time`.
                let index = delay_index + 1;
                self.vec.splice(
                    index..index, // Remove no elements
                    subsequence,
                );
            },

            DelayLookup::Missing { index, delta_time } => {
                // Insert as many Delay commands as necessary to reach the time we want, *then* add the command.
                // Vec::splice and using an iterator is more efficient than a naive while loop that inserts delays until
                // delta_time is reached; see https://stackoverflow.com/questions/28678615.
                self.vec.splice(
                    index..index, // Remove no elements
                    Command::delays(delta_time).chain(subsequence),
                );
            },
        }
    }

    /*
    /// Returns an iterator over the subsequence, if any, at the given time, including any terminating [Delay] command(s).
    ///
    /// ```
    /// # use codec::*;
    /// let sequence = Command::new();
    ///
    /// sequence.push(Command::Delay(10));
    ///
    /// assert_eq!(sequence.at_time(0).next(), Some(Command::Delay(10)));
    /// ```
    pub fn get(&self) {

    }
    */
    // TODO: get (returning an iterator), get_mut, remove

    /// Returns the relative-time after the last [Command]. Does not account for any final command which extends the
    /// *playback* time (not the relative-time), that is, [Command::Note] (use
    /// [CommandSeq::playback_time] to get this value).
    ///
    /// ```
    /// # use codec::*;
    /// let mut sequence = CommandSeq::new();
    /// assert_eq!(sequence.time_at_last_command(), 0);
    ///
    /// sequence.push(Command::Delay(10));
    /// assert_eq!(sequence.time_at_last_command(), 10);
    ///
    /// sequence.push(Command::Delay(10));
    /// sequence.push(Command::Delay(10));
    /// assert_eq!(sequence.time_at_last_command(), 30);
    ///
    /// // Wouldn't make sense to do this in practice, but it is valid.
    /// sequence.push(Command::Delay(0));
    /// assert_eq!(sequence.time_at_last_command(), 30);
    /// ```
    pub fn time_at_last_command(&self) -> usize {
        let mut time = 0;

        for command in self.vec.iter() {
            if let Command::Delay(delta_time) = command {
                time += *delta_time as usize;
            }
        }

        time
    }

    /// Calculates the time it takes for this [CommandSeq] to finish in terms of audio playback (i.e. when all
    /// notes have stopped). Equivalent to [CommandSeq::time_at_last_command] for a sequence with no [Command::Note]s.
    pub fn playback_time(&self) -> usize {
        todo!() // TODO
        // Add an iter_subsequences for this which iterates partitioned by non-zero Delays
    }

    /// See [Vec::with_capacity].
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            vec: Vec::with_capacity(capacity),
        }
    }

    /// Shrinks this sequence to take up as little memory as possible whilst still being playback-equivalent (i.e.
    /// sounds the same).
    pub fn shrink(&mut self) {
        // TODO: remove Delay(0) commands
        // TODO: combine redundant subsequences (e.g. multiple Delay, multiple SetMasterTempo without a delay between)
        self.vec.shrink_to_fit();
    }

    /// Appends the given [Command] to the end of the sequence.
    /// See [Vec::len].
    pub fn push(&mut self, command: Command) { self.vec.push(command) }

    /// Returns the number of commands ("length") in the sequece.
    /// See [Vec::len].
    pub fn len(&mut self) -> usize { self.vec.len() }

    // TODO
    /*
    /// Combines two sequences with the same relative-time space.
    pub fn union<S: Into<CommandSeq>>(&mut self, other: S) {
        todo!()
    }
    */

    /// Performs a search for the [Delay] introducing the given time. `Delay(0)`s are ignored (i.e. the first `Delay`
    /// to introduce `time` is used.
    fn lookup_delay(&self, time: usize) -> DelayLookup {
        if time == 0 {
            return DelayLookup::Missing { index: 0, delta_time: 0 };
        }

        let mut current_time = 0;

        for (index, command) in self.vec.iter().enumerate() {
            if let Command::Delay(delta_time) = command {
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
                        delta_time: current_time - time,
                    };
                }
            }
        }

        // We never reached the target time, so inserting a Delay at the end of the vec would introduce it.
        DelayLookup::Missing {
            index: self.vec.len(),
            delta_time: time - current_time,
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

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
enum DelayLookup {
    /// The index of the [Delay] that introduces the time being looked up. That is, the command (if any) immediately
    /// following this index is at the time being looked up.
    Found(usize),

    /// The index where a `Command::Delay(delta_time)` [or more than one [Delay] if delta_time > 0xFF] should be inserted
    /// to introduce the time being looked up. If delta_time == 0, no [Delay] needs to be inserted (a [Command] inserted
    /// at `index` would be at the right time).
    Missing { index: usize, delta_time: usize },
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
    /// `Delay(0)` is a no-op.
    ///
    /// See [`Command::delays(delta_time)`](Command::delays) to create delays longer than [u8::MAX] ticks.
    Delay(u8),

    /// Sets the beats-per-minute of the composition globally.
    SetMasterTempo(u8),

    Note, // TODO

    // TODO: all other commands
}

use Command::Delay;

impl Default for Command {
    /// Returns a no-op command.
    fn default() -> Self {
        Delay(0)
    }
}

impl Command {
    /// Returns a Command iterator producing a series of [Delay] commands in order to reach the specified delta time.
    /// This is required for any delta time greater than [0xFF](u8::MAX) ticks (which a [Delay] is unable to hold).
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
