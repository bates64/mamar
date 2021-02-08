use lazy_static::lazy_static;
use ttf_parser::{Face, OutlineBuilder};

use super::Ctx;
use crate::display::draw::*;

// Adjustment values in font em units
const FONT_HEIGHT_ADJUST: f32 = -0.3;
const LINE_SPACE: f32 = 0.1;

// Needed because we can't hash Face but it needs to be passed to the `ctx.fill_path` callback
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub enum Font {
    Sans, // comedy skeleton
}

impl Font {
    fn face(&self) -> &Face<'static> {
        lazy_static! {
            // XXX: this is a big file, consider stripping unneeded sections out and/or decompressing it at runtime
            static ref SANS: Face<'static> = Face::from_slice(include_bytes!("../../assets/Inter-Medium.otf"), 0).unwrap();
        }

        match self {
            Font::Sans => &SANS,
        }
    }
}

// TODO: monocolor
pub fn label(ctx: &mut Ctx, font: Font, color: Color, size: f32, text: &str) -> Entity<geometry::multicolor::Geometry> {
    // TODO: cache individual glyph paths and batch them into a longer path

    let mesh = ctx.fill_path((font, color, text), |path, (font, color, text)| {
        let font = font.face();

        let units_per_em = font.units_per_em().unwrap() as f32;
        let font_height = font.height() as f32 + FONT_HEIGHT_ADJUST * units_per_em;

        let mut x_offset = 0.0;
        let mut y_offset = 0.0;

        for ch in text.chars() {
            if ch == '\n' {
                x_offset = 0.0;
                y_offset += font_height;
                y_offset += LINE_SPACE * units_per_em;
                continue;
            } else if ch == ' ' {
                x_offset += units_per_em / 4.0;
                continue;
            }

            let glyph_id = font.glyph_index(ch).unwrap();
            let mut font_path = FontPathBuilder {
                path,
                attr: &color.as_rgba_f32(),
                x_offset,
                y_offset,
                flip_height: font_height,
            };
            let rect = font.outline_glyph(glyph_id, &mut font_path).unwrap();

            // TODO: kerning
            x_offset += rect.x_max as f32;
        }

        None // TODO: bounding box like measure()
    });

    // Convert to view space
    let units_per_em = font.face().units_per_em().unwrap() as f32;
    mesh.scale(size / units_per_em)
}

/*
/// Calculates the width and height of a piece of text at size 1.0. Multiply the result by the font size.
// TODO: move this to fill_text and have ColorGeometry track the aabb?
pub fn measure(font: &Face<'_>, text: &str) -> Size {
    let scale = font.units_per_em().unwrap() as f32;
    let font_height = font.height() as f32 + FONT_HEIGHT_ADJUST * scale;

    let mut x_offset = 0.0;
    let mut y_offset = 0.0;

    let mut size = Size::new(0.0, font_height);

    for ch in text.chars() {
        if ch == '\n' {
            x_offset = 0.0;
            y_offset += font_height;
            y_offset += LINE_SPACE * scale;
            continue;
        } else if ch == ' ' {
            x_offset += scale / 4.0;
            continue;
        }

        let glyph_id = font.glyph_index(ch).unwrap();
        let rect = font.glyph_bounding_box(glyph_id).unwrap();

        x_offset += rect.x_max as f32;

        if x_offset > size.width {
            size.width = x_offset;
        }
    }

    size.height = y_offset + font_height;

    size / scale
}
*/

struct FontPathBuilder<'a> {
    path: &'a mut PathBuilder,
    attr: &'a [f32],
    x_offset: f32,
    y_offset: f32,
    flip_height: f32,
}

impl<'a> FontPathBuilder<'a> {
    fn point(&self, x: f32, y: f32) -> Point2D<GeomSpace> {
        point(self.x_offset + x, self.y_offset + (self.flip_height - y))
    }
}

impl<'a> OutlineBuilder for FontPathBuilder<'a> {
    fn move_to(&mut self, x: f32, y: f32) {
        self.path.begin(self.point(x, y), self.attr);
    }

    fn line_to(&mut self, x: f32, y: f32) {
        self.path.line_to(self.point(x, y), self.attr);
    }

    fn quad_to(&mut self, x1: f32, y1: f32, x: f32, y: f32) {
        self.path
            .quadratic_bezier_to(self.point(x1, y1), self.point(x, y), self.attr);
    }

    fn curve_to(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, x: f32, y: f32) {
        self.path
            .cubic_bezier_to(self.point(x1, y1), self.point(x2, y2), self.point(x, y), self.attr);
    }

    fn close(&mut self) {
        self.path.end(false);
    }
}
