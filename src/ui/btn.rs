use super::{shape, text, Ui};
use crate::display::draw::*;

#[derive(Default, Debug)]
pub struct ButtonState {
    inflation: f32,
    time_mouse_overed: f32,
}

pub fn primary(ctx: &mut Ctx<Ui>, delta: f32, rect: Rect<ViewSpace>, label: &str, state: &mut ButtonState) -> bool {
    let rect_shape = shape::rect(ctx, rect, color::WHITE);
    let is_click = rect_shape.is_click(ctx, MouseButton::Left);

    // Size animation when clicking / mouse over
    if is_click {
        state.inflation = -6.0;
        state.time_mouse_overed = 0.0;
    } else {
        let target_inflation: f32 = if rect_shape.is_mouse_over(ctx) {
            ctx.request_redraw();

            state.time_mouse_overed += delta;
            (0.8 - (state.time_mouse_overed * 3.0).sin()) * -2.0 // breathing
        } else {
            state.time_mouse_overed = 2.0;
            0.0
        };

        state.inflation = lerp(state.inflation, target_inflation, 10.0 * delta);

        if (state.inflation - target_inflation).abs() < 0.01 {
            // Value is close enough to target
            state.inflation = target_inflation;
        } else {
            ctx.request_redraw();
        }
    }

    let container = shape::rect(ctx, rect.inflate(state.inflation, state.inflation), color::PURPLE);

    let text = text::label(ctx, text::Font::Sans, color::WHITE, 14.0, label)
        .anchor(0.5, 0.5)
        .scale(1.0 + state.inflation / 100.0)
        .translate(rect.center().cast_unit().to_vector());

    container.draw(ctx);
    text.draw(ctx);

    is_click
}
