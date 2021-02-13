use std::mem;
use std::ops::{Deref, DerefMut};

const NUM_STATES: usize = 32;

#[derive(Clone, PartialEq, Eq, Debug)]
pub struct History<State: Clone + Eq> {
    mut_current_state: State,    // Copy of current state
    states: [State; NUM_STATES], // Ring buffer
    newest_state_index: usize,   // Future (for redo)
    current_state_index: usize,  // Immutable current state
    oldest_state_index: usize,   // Past (for undo)
}

impl<State: Clone + Eq> History<State> {
    pub fn new(initial_state: State) -> Self {
        Self {
            mut_current_state: initial_state.clone(),
            states: {
                // Safety: we (should) never access these zeroed elements
                let mut states: [State; NUM_STATES] = unsafe { mem::zeroed() };

                states[0] = initial_state;

                states
            },
            newest_state_index: 0,
            current_state_index: 0,
            oldest_state_index: 0,
        }
    }

    pub fn commit(&mut self) -> bool {
        // was the current state changed?
        if &self.mut_current_state != self.true_current_state() {
            self.current_state_index = Self::next(self.current_state_index);
            self.newest_state_index = self.current_state_index; // Discard future states

            if self.current_state_index == self.oldest_state_index {
                // Move the oldest state index into its future, since we're about to replace it
                self.oldest_state_index = Self::next(self.oldest_state_index);
            }

            // Actually commit the change
            self.states[self.current_state_index] = self.mut_current_state.clone();

            true // Did commit
        } else {
            false // No need to commit (state unchanged)
        }
    }

    pub fn undo(&mut self) -> bool {
        if self.current_state_index != self.oldest_state_index {
            // Back to the past
            self.current_state_index = Self::prev(self.current_state_index);
            self.mut_current_state = self.true_current_state().clone();

            true // Did undo
        } else {
            false // This is already the oldest known state
        }
    }

    pub fn redo(&mut self) -> bool {
        if self.current_state_index != self.newest_state_index {
            // Back to the future
            self.current_state_index = Self::next(self.current_state_index);
            self.mut_current_state = self.true_current_state().clone();

            true // Did redo
        } else {
            false // This is already the newest known state
        }
    }

    fn next(index: usize) -> usize {
        (index + 1) % NUM_STATES
    }

    fn prev(index: usize) -> usize {
        if index == 0 {
            NUM_STATES - 1
        } else {
            index - 1
        }
    }

    fn true_current_state(&self) -> &State {
        &self.states[self.current_state_index]
    }
}

impl<State: Clone + Eq> Deref for History<State> {
    type Target = State;

    fn deref(&self) -> &Self::Target {
        &self.mut_current_state
    }
}

impl<State: Clone + Eq> DerefMut for History<State> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.mut_current_state
    }
}

#[test]
fn history() {
    let mut h = History::new(0);

    // Undo nor redo should not be allowed, there is no future and there is no past
    assert!(!h.undo());
    assert!(!h.redo());

    // Add two states
    *h = 1;
    assert!(h.commit()); // Should commit
    *h = 2;
    assert!(h.commit()); // Should commit

    // Undo those two states
    assert!(h.undo());
    assert!(h.undo());
    dbg!(&h);
    assert_eq!(*h, 0);

    // Redo
    assert!(h.redo());
    assert_eq!(*h, 1);

    // Undo then committing a new state should reset redo
    assert!(h.undo());
    assert_eq!(*h, 0);
    *h = 2;
    assert!(h.commit());
    assert!(!h.redo()); // Redo should not be possible, the present has diverged
    assert_eq!(*h, 2);
}
