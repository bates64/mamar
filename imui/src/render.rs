use super::Region;

/// Rendering visitor.
pub trait Render {
    fn render_text(&mut self, region: &Region, text: &str);
    fn render_button(&mut self, region: &Region, is_pressed: bool);
}
