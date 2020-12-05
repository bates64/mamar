use std::fmt;

pub mod accelerator;
pub use accelerator::{Accelerator, Key};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Action {
    NewFile,
    OpenFile,
    Save,
    SaveAs,
    Quit,
}

impl fmt::Display for Action {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Action::NewFile => write!(f, "New File..."),
            Action::OpenFile => write!(f, "Open File..."),
            Action::Save => write!(f, "Save"),
            Action::SaveAs => write!(f, "Save As..."),
            Action::Quit => write!(f, "Quit"),
        }
    }
}
