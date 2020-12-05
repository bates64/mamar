use std::fmt::{self, Display, Debug};
use super::Action;
use crate::os::Os;

// TODO: consider renaming `Key` to `Accelerator`, and give this a better name (like "ActionBinding")

/// A keyboard shortcut/binding to an [Action].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Accelerator {
    pub action: Action,
    pub key: Key,
}

/// See <https://www.electronjs.org/docs/api/accelerator>.
#[derive(Debug, PartialEq, Eq, Clone)]
pub struct Key(String);

impl Key {
    pub fn new(key: &str) -> Self {
        // I don't think ui::menu::web will support these
        debug_assert!(!key.contains("Alt+"));
        debug_assert!(!key.contains("Super+"));

        Self(key.to_owned())
    }

    pub fn electron_accelerator(&self) -> Option<&str> {
        if self.0.len() == 0 {
            None
        } else {
            Some(&self.0)
        }
    }
}

impl Display for Key {
    /// See also <https://www.npmjs.com/package/electron-accelerator-formatter>.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let ctrl = match Os::detect() {
            Os::Mac => "⌘",
            Os::Windows => "Ctrl+",
            Os::Linux => "^",
        };

        write!(f, "{}", self.0
            .replace("CmdOrCtrl+", ctrl)
            .replace("CommandOrControl+", ctrl)
            .replace("Shift+", match Os::detect() {
                Os::Mac | Os::Linux => "⇧",
                Os::Windows => "Shift+",
            })
        )
    }
}
