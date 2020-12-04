#![allow(dead_code)]

///! Layout primitives.

/// The line-height. See <https://every-layout.dev/rudiments/modular-scale/>.
const RATIO: f32 = 1.5;

/// Calculates a size proportional to the line-height. `None` corresponds to zero. Positve inputs will be greater than
/// the line-height, and negative values are smaller.
pub fn ratio<T: Into<f32>>(exp: Option<T>) -> String {
    match exp {
        Some(exp) => format!("{}rem", RATIO.powf(exp.into())),
        None => "0".to_owned(),
    }
}

pub mod stack;
pub use stack::{HStack, VStack};

pub mod center;
pub use center::Center;

pub mod text;
pub use text::Text;

pub mod grow;
pub use grow::Grow;
