use pm64::bgm::{Branch, BranchId, Command, Track};
use std::collections::BTreeMap;
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
    branches: BTreeMap<BranchId, Branch>,
    mix: u8,
    /// Another version of the track, drawn as outlines behind it.
    behind: Option<Track>,
    /// IDs of the selected notes.
    selection: Vec<u32>,
    /// Ticks per CSS pixel.
    zoom: f64,
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
            branches: BTreeMap::new(),
            mix: 0,
            behind: None,
            selection: Vec::new(),
            zoom: 2.0,
        }
    }

    /// Draws `track`, playing the option of each branch that proximity mix `mix` chooses. If `behind` isn't null,
    /// it's another version of the track to draw behind it.
    pub fn set_track(&mut self, track: &JsValue, branches: &JsValue, mix: u8, behind: &JsValue) {
        self.track = crate::from_js(track);
        self.branches = crate::from_js(branches);
        self.mix = mix;
        self.behind = if behind.is_null() || behind.is_undefined() {
            None
        } else {
            Some(crate::from_js(behind))
        };
    }

    pub fn set_viewport(&mut self, width_css_px: f64, height_css_px: f64, dpr: f64) {
        self.vw = width_css_px.max(0.0);
        self.vh = height_css_px.max(0.0);
        self.dpr = dpr.max(1.0);
    }

    pub fn set_selection(&mut self, ids: Vec<u32>) {
        self.selection = ids;
    }

    /// Sets how many ticks each CSS pixel is.
    pub fn set_zoom(&mut self, ticks_per_px: f64) {
        self.zoom = ticks_per_px.max(0.01);
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
        ctx.set_fill_style_str("#181825"); // gray-75, Catppuccin Mocha mantle
        ctx.fill_rect(0.0, 0.0, self.vw, self.vh);

        // horizontal note stripes
        ctx.set_fill_style_str("#11111b"); // gray-50, Catppuccin Mocha crust
        for y in (0..self.vh as i32).step_by(self.note_height() as usize * 2) {
            ctx.fill_rect(0.0, y as f64, self.vw, self.note_height());
        }

        // beat lines
        ctx.set_stroke_style_str("#1e1e2e"); // gray-100, Catppuccin Mocha base
        self.draw_lines(
            ctx,
            self.time_to_x(self.scroll_ticks),
            self.time_to_x(self.scroll_ticks) + self.vw,
            self.beat_width(),
        );

        // bar lines
        ctx.set_stroke_style_str("#313244"); // gray-200, Catppuccin Mocha surface0
        ctx.set_line_width(2.0);
        self.draw_lines(
            ctx,
            self.time_to_x(self.scroll_ticks),
            self.time_to_x(self.scroll_ticks) + self.vw,
            self.beat_width() * 4.0,
        );

        if let Some(behind) = &self.behind {
            ctx.set_stroke_style_str("rgb(29 128 245 / 45%)");
            for (time, pitch, length, _, _) in self.notes(behind) {
                self.draw_note(ctx, time, pitch, length, false);
            }
        }

        // Dashed lines where each branch can switch to another mix's option
        ctx.set_stroke_style_str("rgb(249 226 175 / 35%)"); // Catppuccin Mocha yellow
        let _ = ctx.set_line_dash(&js_sys::Array::of2(&4.0.into(), &4.0.into()));
        ctx.set_line_width(1.0);
        for (time, event) in self.track.commands.playback(&self.branches) {
            if let Command::Branch { .. } = event.command {
                let x = self.time_to_x(time as f64);
                ctx.begin_path();
                ctx.move_to(x, 0.0);
                ctx.line_to(x, self.vh);
                ctx.stroke();
            }
        }
        let _ = ctx.set_line_dash(&js_sys::Array::new());
        ctx.set_line_width(2.0);

        ctx.set_stroke_style_str("#1d80f5");
        ctx.set_fill_style_str("#066ce7");
        for (time, pitch, length, velocity, id) in self.notes(&self.track) {
            let selected = id.is_some_and(|id| self.selection.contains(&id));
            if selected {
                ctx.set_fill_style_str("#f9e2af"); // Catppuccin Mocha yellow
                ctx.set_stroke_style_str("#fab387"); // Catppuccin Mocha peach
            }
            // Quieter notes are fainter
            ctx.set_global_alpha(0.35 + 0.65 * (velocity.min(127) as f64 / 127.0));
            self.draw_note(ctx, time, pitch, length, true);
            ctx.set_global_alpha(1.0);
            if selected {
                ctx.set_stroke_style_str("#1d80f5");
                ctx.set_fill_style_str("#066ce7");
            }
        }

        ctx.restore();
        Ok(())
    }

    /// The notes `track` plays, as (time, pitch, length, velocity, ID), with each branch playing the option for the
    /// current mix. Notes in branches have no ID, as they aren't the track's own.
    fn notes(&self, track: &Track) -> Vec<(usize, u8, u16, u8, Option<u32>)> {
        let mut notes = Vec::new();
        for (time, event) in track.commands.playback(&self.branches) {
            match event.command {
                Command::Note {
                    pitch,
                    length,
                    velocity,
                } => notes.push((time, pitch, length, velocity, Some(event.id))),
                Command::Branch { branch } => {
                    let Some(branch) = self.branches.get(&branch) else {
                        continue;
                    };
                    let option = branch.options.get(self.mix as usize).or(branch.options.first());
                    for (offset, event) in option
                        .map(|option| option.commands.playback(&self.branches))
                        .unwrap_or_default()
                    {
                        if let Command::Note {
                            pitch,
                            length,
                            velocity,
                        } = event.command
                        {
                            notes.push((time + offset, pitch, length, velocity, None));
                        }
                    }
                }
                _ => {}
            }
        }
        notes
    }

    fn draw_note(&self, ctx: &web_sys::CanvasRenderingContext2d, time: usize, pitch: u8, length: u16, fill: bool) {
        let x = self.time_to_x(time as f64);
        let Some(y) = self.pitch_to_y(pitch) else { return };
        let w = self.time_to_x(length as f64) - self.time_to_x(0.0);
        let h = self.note_height();

        if x + w < 0.0 || x > self.vw {
            return;
        }

        ctx.save();
        ctx.begin_path();
        let _ = ctx.round_rect_with_f64(x, y, w, h, 1.0);
        if fill {
            ctx.fill();
        }
        ctx.clip();
        let _ = ctx.round_rect_with_f64(x, y, w, h, 1.0);
        ctx.stroke();
        ctx.restore(); // restore unclipped state
    }

    fn time_to_x(&self, time: f64) -> f64 {
        (time - self.scroll_ticks) / self.zoom
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
