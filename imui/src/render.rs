use super::{Region, Size};

pub trait Render {
    // Layout utilities.
    fn measure_text(&mut self, text: &str) -> Size;

    // Visitor pattern for rendering.
    fn render_text(&mut self, region: &Region, text: &str);
    fn render_button(&mut self, region: &Region, is_pressed: bool);

    fn render_window(&mut self, region: &Region);
}
