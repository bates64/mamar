#![allow(dead_code)]

///! Newtypes providing type-safe wrappers around CSS property values.

pub mod pad;
pub use pad::Pad;

pub mod color;
pub use color::Color;

pub mod align;
pub use align::Align;
