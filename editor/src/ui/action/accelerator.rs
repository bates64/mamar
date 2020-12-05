use std::fmt::{self, Display, Debug};
use super::Action;
use crate::os::Os;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Accelerator {
    pub action: Action,
    pub keys: Vec<Key>,
}

#[derive(Debug, PartialEq, Eq, Copy, Clone)]
pub enum Key {
    /// Maps to `⌘ Command` on macOS.
    Ctrl,
    Shift,

    N,
    O,
    S,
}

impl Display for Key {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Key::Ctrl => match Os::detect() {
                Os::Mac => write!(f, "⌘"),
                //Os::Linux => write!(f, "^"),
                _ => write!(f, "Ctrl+"),
            },
            Key::Shift => match Os::detect() {
                Os::Mac => write!(f, "⇧"),
                _ => write!(f, "Shift+"),
            },
            _ => write!(f, "{:?}", self),
        }
    }
}
