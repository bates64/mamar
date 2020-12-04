use super::super::layout::ratio;

#[derive(Clone, Copy, PartialEq)]
pub enum Pad {
    All(f32),
    H(f32),
    V(f32),
    Top(f32),
    Right(f32),
    Bottom(f32),
    Left(f32),

    /// Clockwise (top, right, bottom, left)
    Manual(f32, f32, f32, f32),

    None,
}

impl Pad {
    pub fn top(&self) -> Option<f32> {
        match self {
            | Pad::All(x)
            | Pad::V(x)
            | Pad::Top(x)
            | Pad::Manual(x, _, _, _) => Some(*x),
            _ => None,
        }
    }

    pub fn right(&self) -> Option<f32> {
        match self {
            | Pad::All(x)
            | Pad::H(x)
            | Pad::Right(x)
            | Pad::Manual(_, x, _, _) => Some(*x),
            _ => None,
        }
    }

    pub fn bottom(&self) -> Option<f32> {
        match self {
            | Pad::All(x)
            | Pad::V(x)
            | Pad::Bottom(x)
            | Pad::Manual(_, _, x, _) => Some(*x),
            _ => None,
        }
    }

    pub fn left(&self) -> Option<f32> {
        match self {
            | Pad::All(x)
            | Pad::H(x)
            | Pad::Left(x)
            | Pad::Manual(_, _, _, x) => Some(*x),
            _ => None,
        }
    }

    pub fn css_value(&self) -> String {
        format!(
            "{} {} {} {}",
            ratio(self.top()),
            ratio(self.right()),
            ratio(self.bottom()),
            ratio(self.left()),
        )
    }
}

impl Default for Pad {
    fn default() -> Self {
        Pad::None
    }
}
