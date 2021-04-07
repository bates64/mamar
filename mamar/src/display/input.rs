use glium::glutin::event::MouseButton;

use crate::util::*;
use crate::display::Entity;

/// Input state at a particular frame.
#[derive(Default, Clone)]
pub struct InputMoment {
    pub mouse_pos: Option<Point2D>, // None if outside application window
    pub mouse_pos_raycasted: Option<Point3D>,

    pub left_mouse: bool,
    pub right_mouse: bool,
    pub middle_mouse: bool,

    pub scroll_delta: Vector2D,
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

    pub fn unset_mouse_pos(&mut self) {
        self.mouse_pos = None;
        self.mouse_pos_raycasted = None;
    }

    pub fn set_mouse_pos(&mut self, pos: Point2D) {
        self.mouse_pos = Some(pos);
        self.mouse_pos_raycasted = None; // Must be updated by calc_mouse_pos_raycasted() later
    }

    /// Mouse picking (figure out the position where the mouse hits in 3D space)
    pub fn calc_mouse_pos_raycasted(&mut self, root: &mut Box<dyn Entity>) {
        if let Some(mouse_pos) = self.mouse_pos {
            self.mouse_pos_raycasted = raycast_z(mouse_pos, root);
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

    pub fn mouse_pos_delta(&self) -> Vector2D {
        if let (Some(prev), Some(now)) = (self.prev.mouse_pos, self.now.mouse_pos) {
            prev.to_vector() - now.to_vector()
        } else {
            vec2(0.0, 0.0)
        }
    }

    /// Advance to the next frame, cloning current input state.
    pub fn next_frame(&mut self) {
        self.prev = self.now.clone();

        self.now.scroll_delta = vec2(0.0, 0.0);
    }
}

fn raycast_z(pos: Point2D, entity: &mut Box<dyn Entity>) -> Option<Point3D> {
    // Convert entity bounding box to 2D
    let bb_3d = entity.bounding_box();
    let bb_2d = Box2D {
        min: bb_3d.min.to_2d(),
        max: bb_3d.max.to_2d(),
    };

    if bb_2d.contains(pos) {
        // Register a hit at the *lowest* z-pos of this entity.
        let mut hit = point3(pos.x, pos.y, bb_3d.min.z);

        if let Some(group) = entity.children() {
            // Recurse over the entity's children and check their bounding-boxes also
            for child in group {
                if let Some(inner_hit) = raycast_z(pos.clone(), child) {
                    // If we collided with the child, only update `hit` if it is above (in z-pos) the current `hit`.
                    if inner_hit.z > hit.z {
                        hit = inner_hit;
                    }
                }
            }
        }

        Some(hit)
    } else {
        // No collision
        None
    }
}
