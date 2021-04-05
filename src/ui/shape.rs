use cached::{cached_key, TimedCache};

use crate::display::geo::Multicolor;
use crate::display::Entity;
use crate::util::*;

pub fn rect(rect: Rect, color: Color) -> Multicolor {
    let mut entity = rect_origin(rect.width(), rect.height(), color);
    entity.translate(rect.origin.to_vector().to_3d());
    entity
}

cached_key! {
    RECT_CACHE: TimedCache<(usize, usize, Color), Multicolor> = TimedCache::with_lifespan(60);

    Key = (width as usize, height as usize, color);

    fn rect_origin(width: f32, height: f32, color: Color) -> Multicolor = {
        // Draw a square here and just scale it up later; this allows for indefinite caching
        // TODO: draw in a single color and use a shader to change it
        let mut square = Multicolor::build_svg(|path| {
            let color = color.as_rgba_f32();

            path.begin(point(0.0, 0.0), &color); // top-left
            path.line_to(point(1.0, 0.0), &color); // top-right
            path.line_to(point(1.0, 1.0), &color); // bottom-right
            path.line_to(point(0.0, 1.0), &color); // bottom-left
            path.end(true);
        });

        square.scale_2d(width, height);
        square
    }
}
