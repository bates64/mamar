///! This module mainly rexports types from `euclid` as `f32`s with units.
///! Note that `lyon::math` does this too (for GeomSpace).
use euclid::Trig;

// Coordinate systems.
// See https://learnopengl.com/Getting-started/Coordinate-Systems for more info.
pub type GeomSpace = euclid::UnknownUnit; // Space local to a `Geometry`. AKA local space
pub type ViewSpace = ScreenSpace; // TODO; use for scrollable viewports (cameras)
pub struct ScreenSpace; // Range that is the screen divided by the DPI scale
pub struct ClipSpace; // What GL expects; normalized device coordinates (range -1.0..1.0)

/// Calculates a screen-space projection matrix for the given display.
/// Needs to be recalculated if the display's size or DPI changes.
pub fn screen_to_clip(display: &glium::Display) -> Transform3D<ScreenSpace, ClipSpace> {
    let gl_window = display.gl_window();
    let window = gl_window.window();
    let size = window.inner_size().to_logical(window.scale_factor());

    // This orthographic projection converts logical screen-space coords to normalized (-1.0..1.0) coords for GL.
    Transform3D::ortho(0.0, size.width, size.height, 0.0, -1.0, 1.0)
}

// Everything is f32!
pub type Point2D<Space> = euclid::Point2D<f32, Space>;
pub type Point3D<Space> = euclid::Point3D<f32, Space>;
pub type Vector2D<Space> = euclid::Vector2D<f32, Space>;
pub type Vector3D<Space> = euclid::Vector3D<f32, Space>;
pub type Size2D<Space> = euclid::Size2D<f32, Space>;
pub type Size3D<Space> = euclid::Size3D<f32, Space>;
pub type Box2D<Space> = euclid::Box2D<f32, Space>;
pub type Box3D<Space> = euclid::Box3D<f32, Space>;
pub type Rect<Space> = euclid::Rect<f32, Space>;
pub type Transform2D<FromSpace, ToSpace> = euclid::Transform2D<f32, FromSpace, ToSpace>;
pub type Transform3D<FromSpace, ToSpace> = euclid::Transform3D<f32, FromSpace, ToSpace>;
pub type Angle = euclid::Angle<f32>;

// Convenience functions
pub use euclid::{point2 as point, point3, rect, size2, size3, vec2, vec3};

pub fn rad(radians: f32) -> Angle {
    Angle { radians }
}

pub fn deg(degrees: f32) -> Angle {
    Angle {
        radians: Trig::degrees_to_radians(degrees),
    }
}
