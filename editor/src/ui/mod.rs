pub mod css;
pub mod layout;
pub mod action;

pub mod app;
pub use app::App;
pub mod status_bar;
pub use status_bar::StatusBar;
pub mod title_bar;
pub use title_bar::TitleBar;
pub mod menu;
pub use menu::Menu;

mod prelude {
    pub use yew::prelude::*;
    pub use yewtil::NeqAssign;
    pub use super::css::*;
    pub use super::layout::*;
}
