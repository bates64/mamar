pub mod color;
pub mod math;

pub use color::Color;
pub use math::*;

pub fn lerp(current: f32, target: f32, factor: f32) -> f32 {
    let t = match factor {
        t if t < 0.0 => 0.0,
        t if t > 1.0 => 1.0,
        t => t,
    };

    current * (1.0 - t) + target * t
}
