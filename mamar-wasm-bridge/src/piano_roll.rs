use pm64::bgm::{Command, Track};
use std::f64;
use wasm_bindgen::prelude::*;

const MIDI_PITCH_0: u8 = 107;
const LOWEST_PITCH: u8 = 0; //MIDI_PITCH_0 + 13; // C1
const HIGHEST_PITCH: u8 = 255; //MIDI_PITCH_0 + 120;

const TICKS_PER_BEAT: f64 = 48.0;

#[wasm_bindgen]
pub struct PianoRoll {
    // viewport
    vw: f64,
    vh: f64,
    dpr: f64,
    scroll_ticks: f64,

    // state
    track: Track,
}

#[wasm_bindgen]
impl PianoRoll {
    #[wasm_bindgen(constructor)]
    pub fn new() -> PianoRoll {
        PianoRoll {
            vw: 0.0,
            vh: 0.0,
            dpr: 1.0,
            scroll_ticks: 0.0,
            track: Track::default(),
        }
    }

    pub fn set_track(&mut self, track: &JsValue) {
        self.track = crate::from_js(track);
    }

    pub fn set_viewport(&mut self, width_css_px: f64, height_css_px: f64, dpr: f64) {
        self.vw = width_css_px.max(0.0);
        self.vh = height_css_px.max(0.0);
        self.dpr = dpr.max(1.0);
    }

    pub fn set_scroll_x(&mut self, scroll_left_css_px: f64) {
        self.scroll_ticks = scroll_left_css_px.max(0.0);
    }

    fn draw_lines(&self, ctx: &web_sys::CanvasRenderingContext2d, start: f64, end: f64, step: f64) {
        ctx.begin_path();
        let mut x = start;
        while x <= end {
            let sx = x - self.scroll_ticks;
            ctx.move_to(sx, 0.0);
            ctx.line_to(sx, self.vh);
            x += step;
        }
        ctx.stroke();
    }

    pub fn render(&mut self, ctx: &web_sys::CanvasRenderingContext2d) -> Result<(), JsValue> {
        // Draw in device pixels, but use CSS pixel coordinates in the API.
        // JS should have set canvas.width/height = css * dpr.
        ctx.save();
        ctx.set_transform(self.dpr, 0.0, 0.0, self.dpr, 0.0, 0.0)?;

        // clear
        ctx.set_fill_style_str("#0e0e0e"); // gray-75
        ctx.fill_rect(0.0, 0.0, self.vw, self.vh);

        // horizontal note stripes
        ctx.set_fill_style_str("#000000"); // gray-50
        for y in (0..self.vh as i32).step_by(self.note_height() as usize * 2) {
            ctx.fill_rect(0.0, y as f64, self.vw, self.note_height());
        }

        // beat lines
        ctx.set_stroke_style_str("#1d1d1d"); // gray-100
        self.draw_lines(
            ctx,
            self.time_to_x(self.scroll_ticks),
            self.time_to_x(self.scroll_ticks) + self.vw,
            self.beat_width(),
        );

        // bar lines
        ctx.set_stroke_style_str("#303030"); // gray-200
        ctx.set_line_width(2.0);
        self.draw_lines(
            ctx,
            self.time_to_x(self.scroll_ticks),
            self.time_to_x(self.scroll_ticks) + self.vw,
            self.beat_width() * 4.0,
        );

        // notes
        ctx.set_stroke_style_str("#1d80f5");
        ctx.set_fill_style_str("#066ce7");
        for (time, event) in self.track.commands.iter_time() {
            if let Command::Note { pitch, length, .. } = event.command {
                let x = self.time_to_x(time as f64);
                let Some(y) = self.pitch_to_y(pitch) else { continue };
                let w = self.time_to_x(length as f64);
                let h = self.note_height();

                if x + w < 0.0 || x > self.vw {
                    continue;
                }

                ctx.save();

                ctx.begin_path();
                let _ = ctx.round_rect_with_f64(x, y, w, h, 1.0);
                ctx.fill();

                ctx.clip();
                let _ = ctx.round_rect_with_f64(x, y, w, h, 1.0);
                ctx.stroke();

                ctx.restore(); // restore unclipped state
            }
        }

        ctx.restore();
        Ok(())
    }

    fn time_to_x(&self, time: f64) -> f64 {
        let ruler_zoom = 2.0; // TODO: acquire css var --ruler-zoom
        (time - self.scroll_ticks) / ruler_zoom
    }

    fn beat_width(&self) -> f64 {
        self.time_to_x(TICKS_PER_BEAT) - self.time_to_x(0.0)
    }

    fn note_height(&self) -> f64 {
        12.0
    }

    /// Converts a pitch to a y coordinate, where:
    /// - highest pitch is at the top (y = 0)
    /// - lowest pitch is at the bottom (y = self.vh)
    fn pitch_to_y(&self, pitch: u8) -> Option<f64> {
        if !(LOWEST_PITCH..=HIGHEST_PITCH).contains(&pitch) {
            None
        } else {
            Some((HIGHEST_PITCH - pitch) as f64 * self.note_height())
        }
    }

    /// Returns the height of the scrollable area of the piano roll.
    pub fn scroll_height(&self) -> f64 {
        self.pitch_to_y(LOWEST_PITCH).unwrap_or(0.0) + self.note_height()
    }

    pub fn central_scroll_y(&self) -> f64 {
        let range = self.track.commands.pitch_range();
        if range.is_empty() {
            return self.scroll_height() / 2.0;
        }
        let middle = (range.start + range.end) / 2;
        self.pitch_to_y(middle).unwrap_or(0.0) + self.note_height() / 2.0
    }
}

impl Default for PianoRoll {
    fn default() -> Self {
        Self::new()
    }
}
