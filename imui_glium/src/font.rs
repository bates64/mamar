use std::error::Error;

use crossfont::*;
use glium::texture::RawImage2d;

use crate::atlas::TextureAtlas;

pub fn load<I>(atlas: &mut TextureAtlas, font_name: String, chars: I, dpi: f32) -> Result<(), Box<dyn Error>>
where
    I: Iterator<Item = char>,
{
    let mut rasterizer = Rasterizer::new(dpi, false)?;

    let size = Size::new(11.0);
    let font_key = rasterizer.load_font(
        &FontDesc::new(font_name, Style::Description {
            slant: Slant::Normal,
            weight: Weight::Normal,
        }),
        size,
    )?;

    for character in chars {
        let glyph = rasterizer.get_glyph(GlyphKey {
            character,
            font_key,
            size,
        })?;

        let dimensions = (glyph.width as u32, glyph.height as u32);

        match glyph.buffer {
            BitmapBuffer::RGB(data) => {
                // Create RGBA buffer, replacing black pixels with transparency.
                let mut rgba = Vec::with_capacity(data.len());
                for rgb in data.chunks(3) {
                    // FIXME: this looks awful
                    let lightness = rgb[0] / 3 + rgb[1] / 3 + rgb[2] / 3;

                    rgba.extend_from_slice(&[
                        rgb[0],
                        rgb[1],
                        rgb[2],
                        if lightness > 50 { 255 } else { 0 },
                    ])
                }

                atlas.insert_raw(character, RawImage2d::from_raw_rgba(rgba, dimensions));
            }
            BitmapBuffer::RGBA(data) => {
                atlas.insert_raw(character, RawImage2d::from_raw_rgba(data, dimensions));
            }
        };
    }

    Ok(())
}
