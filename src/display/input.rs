use glium::glutin::event::MouseButton;

use crate::util::*;

#[derive(Default, Clone)]
pub struct InputState {
    pub mouse_pos: Option<Point2D>,
    pub mouse_pos_raycasted: Option<Point3D>,

    pub left_mouse: bool,
    pub right_mouse: bool,
    pub middle_mouse: bool,
}

impl InputState {
    pub fn set_mouse_button(&mut self, button: MouseButton, is_down: bool) {
        match button {
            MouseButton::Left => self.left_mouse = is_down,
            MouseButton::Right => self.right_mouse = is_down,
            MouseButton::Middle => self.middle_mouse = is_down,
            _ => (),
        }
    }
}
