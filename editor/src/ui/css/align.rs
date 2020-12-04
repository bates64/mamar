/// A combination of the CSS properties `align-items` and `justify-content`.
///
/// See <https://css-tricks.com/snippets/css/a-guide-to-flexbox/> for more information.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Align {
    Start,
    End,
    Center,
    SpaceBetween,
}

impl Align {
    pub fn css(&self) -> &'static str {
        match self {
            Align::Start        => "align-items: flex-start;",
            Align::End          => "align-items: flex-end;",
            Align::Center       => "align-items: center; justify-content: center;",
            Align::SpaceBetween => "justify-content: space-between;",
        }
    }
}

impl Default for Align {
    fn default() -> Self {
        Align::Start
    }
}
