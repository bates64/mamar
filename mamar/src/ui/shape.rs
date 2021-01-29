use crate::display::draw::*;
use super::Ctx;

pub fn rect(ctx: &mut Ctx, rect: Rect<ViewSpace>, color: Color) -> Entity<geometry::multicolor::Geometry> {
    rect_origin(ctx, rect.width(), rect.height(), color)
        .translate(rect.origin.to_vector())
}

pub fn rect_origin(ctx: &mut Ctx, width: f32, height: f32, color: Color) -> Entity<geometry::multicolor::Geometry> {
    // Draw a square here and just scale it up later; this allows for indefinite caching
    // TODO: draw in a single color and use a shader to change it
    let square = ctx.fill_path(color, |path, color| {
        let color = color.as_rgba_f32();

        path.begin(point(0.0, 0.0), &color); // top-left
        path.line_to(point(1.0, 0.0), &color); // top-right
        path.line_to(point(1.0, 1.0), &color); // bottom-right
        path.line_to(point(0.0, 1.0), &color); // bottom-left
        path.end(true);

        Some(Box2D {
            min: point(0.0, 0.0),
            max: point(1.0, 1.0),
        })
    });

    square
        .scale_2d(width, height)
}
