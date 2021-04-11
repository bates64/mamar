use fontdue::Font;
use fontdue::layout::*;
use glium::texture::RawImage2d;
use imui::{Rect, Point, Size};

use crate::atlas::{TextureAtlas, Sprite};

pub use fontdue::layout::TextStyle;

pub struct Face {
    font: Font,
    layout: Layout,
}

impl Face {
    pub fn load(font_bytes: &[u8]) -> Result<Self, &'static str> {
        Ok(Face {
            font: Font::from_bytes(font_bytes, Default::default())?,
            layout: Layout::new(fontdue::layout::CoordinateSystem::PositiveYDown),
        })
    }

    pub fn layout<R>(&mut self, atlas: &mut TextureAtlas, rect: &Rect, style: &TextStyle, mut render_quad: R)
    where
        R: FnMut(&Sprite, Rect),
    {
        self.layout.reset(&LayoutSettings {
            x: rect.min_x(),
            y: rect.min_y(),
            max_width: Some(rect.max_x()),
            max_height: Some(rect.max_y()),
            horizontal_align: HorizontalAlign::Center, // TODO make configurable
            vertical_align: VerticalAlign::Middle, // TODO make configurable
            wrap_style: WrapStyle::Word,
            wrap_hard_breaks: true,
        });
        self.layout.append(&[&self.font], style);

        for glyph in self.layout.glyphs() {
            let sprite = if let Some(sprite) = atlas.get(glyph.key) {
                // Glyph already loaded, use that.
                sprite
            } else {
                let (metrics, data) = self.font.rasterize_config(glyph.key);
                let dimensions = (metrics.width as u32, metrics.height as u32);

                if dimensions.0 == 0 || dimensions.1 == 0 {
                    continue;
                }

                // Convert intensity data to RGBA.
                let mut rgba = Vec::with_capacity(data.len() * 4);
                for intensity in data {
                    rgba.extend_from_slice(&[255, 255, 255, intensity]);
                }

                atlas.insert_raw(glyph.key, RawImage2d::from_raw_rgba(rgba, dimensions));
                atlas.get(glyph.key).unwrap()
            };

            render_quad(sprite, Rect {
                origin: Point::new(glyph.x, glyph.y),
                size: Size::new(glyph.width as f32, glyph.height as f32),
            });
        }
    }
}
