use enumflags2::bitflags;

#[bitflags]
#[repr(u8)]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum Input {
    MouseOver,

    LeftMouseDown,
    RightMouseDown,
    MiddleMouseDown,
}

pub type InputFlags = enumflags2::BitFlags<Input>;

/// Finite state machine for clicking.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum ClickFSM {
    No,

    /// Set whilst the mouse is over this element.
    Hover,

    /// Set whilst the user is holding the mouse button down.
    /// Reverts to No if the mouse leaves the element, even if the mouse is still down.
    Press,

    /// Set for the one update-frame when the mouse button is raised.
    Click,
}

impl Default for ClickFSM {
    fn default() -> Self {
        ClickFSM::No
    }
}

impl ClickFSM {
    pub(crate) fn advance(self, button: Input, flags: InputFlags) -> ClickFSM {
        debug_assert!(
            button == Input::LeftMouseDown ||
            button == Input::RightMouseDown ||
            button == Input::MiddleMouseDown
        );

        match self {
            // Enter Click.
            ClickFSM::Press if flags.contains(Input::MouseOver) && !flags.contains(button) => ClickFSM::Click,

            // Enter or stay in Press.
            ClickFSM::Hover | ClickFSM::Press | ClickFSM::Click if flags.contains(Input::MouseOver | button) => ClickFSM::Press,

            // Enter or stay in Hover.
            _ if flags.contains(Input::MouseOver) => ClickFSM::Hover,

            // Revert to No.
            _ => ClickFSM::No,
        }
    }

    pub fn is_click(&self) -> bool {
        *self == ClickFSM::Click
    }

    pub fn is_press(&self) -> bool {
        *self == ClickFSM::Press
    }
}
