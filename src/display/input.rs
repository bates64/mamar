use glium::glutin::event::MouseButton;

use crate::util::*;

/// Input state at a particular frame.
#[derive(Default, Clone)]
pub struct InputMoment {
    pub mouse_pos: Option<Point2D>, // None if outside application window
    pub mouse_pos_raycasted: Option<Point3D>,

    pub left_mouse: bool,
    pub right_mouse: bool,
    pub middle_mouse: bool,
}

/// Input state at a frame, plus the previous state to compare to.
/// e.g. this is required to check for clicks (a click is defined as a mouse down in `prev` and a mouse up in `now`).
#[derive(Default, Clone)]
pub struct Input {
    pub now: InputMoment,
    pub prev: InputMoment,
}

impl InputMoment {
    pub fn set_mouse_button(&mut self, button: MouseButton, is_down: bool) {
        match button {
            MouseButton::Left => self.left_mouse = is_down,
            MouseButton::Right => self.right_mouse = is_down,
            MouseButton::Middle => self.middle_mouse = is_down,
            _ => (),
        }
    }
}

impl Input {
    pub fn is_mouse_over(&self, b: &Box3D) -> bool {
        if let Some(mouse_pos) = self.now.mouse_pos_raycasted {
            // We need to inflate on the Z axis slightly because the mouse_pos may be on the exact border
            b.inflate(0.0, 0.0, 0.0001).contains(mouse_pos)
        } else {
            false
        }
    }

    // Clicking is defined as a 'mouse up' action (i.e. on the previous frame, the mouse button was down, but on the
    // current frame it has become up).
    pub fn is_left_click(&self, b: &Box3D) -> bool {
        !self.now.left_mouse
            && self.prev.left_mouse
            && self.is_mouse_over(b)
    }

    /// Advance to the next frame, cloning current input state.
    pub fn next_frame(&mut self) {
        self.prev = self.now.clone();
    }
}
