#[derive(Clone, Copy, PartialEq)]
pub enum Color {
    // Accents
    Pink,
    Yellow,
    Brown,
    Rose,
    Red,

    // Greyscale
    Black,

    None,
}

impl Color {
    pub fn css_value(&self) -> &'static str {
        match self {
            Color::Pink => "var(--pink)",
            Color::Yellow => "var(--yellow)",
            Color::Brown => "var(--brown)",
            Color::Rose => "var(--rose)",
            Color::Red => "var(--red)",
            Color::Black => "var(--black)",
            Color::None => "transparent",
        }
    }

    pub fn bg(&self) -> String {
        format!("--bg: {};", self.css_value())
    }

    pub fn on_css_value(&self) -> &'static str {
        match self {
            Color::Pink => "var(--on-pink)",
            Color::Yellow => "var(--on-yellow)",
            Color::Brown => "var(--on-brown)",
            Color::Rose => "var(--on-rose)",
            Color::Red => "var(--on-red)",
            Color::Black => "var(--on-black)",
            _ => "",
        }
    }

    pub fn fg(&self) -> String {
        if let Color::None = self {
            return "".to_owned();
        }
        format!("--fg: {};", self.on_css_value())
    }
}

impl Default for Color {
    fn default() -> Self {
        Color::None
    }
}
