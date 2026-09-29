use pm64::bgm::{Branch, BranchId, Command, Event, Track};
use std::collections::BTreeMap;
use std::f64;
use wasm_bindgen::prelude::*;

/// The pitches the engine plays as notes, which are the piano roll's rows: 0x80, C2 in the octaves the instruments are
/// named in, to 0xD3, B8. The engine plays the low 7 bits as semitones from the instrument's base key.
const LOWEST_PITCH: u8 = 0x80;
const HIGHEST_PITCH: u8 = 0xD3;

/// Whether `pitch` is a black key, counting 0x80 as C.
fn is_black_key(pitch: u8) -> bool {
    matches!(pitch.wrapping_sub(0x80) % 12, 1 | 3 | 6 | 8 | 10)
}

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
    /// The notes the track plays, worked out once per change, as finding them follows every detour and branch.
    notes: Vec<Note>,
    /// Notes of another version of the track, drawn as outlines behind it.
    behind_notes: Vec<Note>,
    /// Times the track can switch to another mix's branch option.
    branch_times: Vec<usize>,
    /// IDs of the selected notes.
    selection: Vec<u32>,
    /// The highest pitch the track's instrument plays at its own pitch, above which the engine plays notes lower than
    /// they should be, from each time the instrument or its tuning changes until the next, in time order. None is no
    /// limit.
    pitch_limits: Vec<(usize, Option<u8>)>,
    /// Ticks per CSS pixel.
    zoom: f64,
    /// Whether anything drawn has changed since the last render. The canvas keeps what was drawn until then.
    dirty: bool,
}

/// A note to draw: its time, pitch, length, velocity, and ID. Notes in branches have no ID, as they aren't the
/// track's own.
type Note = (usize, u8, u16, u8, Option<u32>);

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
            notes: Vec::new(),
            behind_notes: Vec::new(),
            branch_times: Vec::new(),
            selection: Vec::new(),
            pitch_limits: Vec::new(),
            zoom: 2.0,
            dirty: true,
        }
    }

    /// Draws `track`, playing the option of each branch that proximity mix `mix` chooses. If `behind` isn't null,
    /// it's another version of the track to draw behind it.
    pub fn set_track(&mut self, track: &JsValue, branches: &JsValue, mix: u8, behind: &JsValue) {
        let track: Track = crate::from_js(track);
        let branches: BTreeMap<BranchId, Branch> = crate::from_js(branches);
        let played = track.commands.playback(&branches);
        self.notes = notes(&played, &branches, mix);
        self.branch_times = played
            .iter()
            .filter(|(_, event)| matches!(event.command, Command::Branch { .. }))
            .map(|(time, _)| *time)
            .collect();
        self.behind_notes = if behind.is_null() || behind.is_undefined() {
            Vec::new()
        } else {
            let behind: Track = crate::from_js(behind);
            notes(&behind.commands.playback(&branches), &branches, mix)
        };
        self.track = track;
        self.dirty = true;
    }

    pub fn set_viewport(&mut self, width_css_px: f64, height_css_px: f64, dpr: f64) {
        self.vw = width_css_px.max(0.0);
        self.vh = height_css_px.max(0.0);
        self.dpr = dpr.max(1.0);
        // Resizing a canvas clears it
        self.dirty = true;
    }

    pub fn set_selection(&mut self, ids: Vec<u32>) {
        self.selection = ids;
        self.dirty = true;
    }

    /// Sets the highest pitch the track's instrument plays at its own pitch from each of `times`, in time order, until
    /// the next. A limit of 0 is no limit, as 0 isn't a pitch the engine plays.
    pub fn set_pitch_limits(&mut self, times: Vec<u32>, limits: Vec<u8>) {
        self.pitch_limits = times
            .into_iter()
            .zip(limits)
            .map(|(time, limit)| (time as usize, (limit != 0).then_some(limit)))
            .collect();
        self.dirty = true;
    }

    /// Sets how many ticks each CSS pixel is.
    pub fn set_zoom(&mut self, ticks_per_px: f64) {
        self.zoom = ticks_per_px.max(0.01);
        self.dirty = true;
    }

    pub fn set_scroll_x(&mut self, scroll_left_css_px: f64) {
        self.scroll_ticks = scroll_left_css_px.max(0.0);
        self.dirty = true;
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

    /// Draws the piano roll, if anything has changed since it was last drawn.
    pub fn render(&mut self, ctx: &web_sys::CanvasRenderingContext2d) -> Result<(), JsValue> {
        if !self.dirty {
            return Ok(());
        }
        self.dirty = false;

        // Draw in device pixels, but use CSS pixel coordinates in the API.
        // JS should have set canvas.width/height = css * dpr.
        ctx.save();
        ctx.set_transform(self.dpr, 0.0, 0.0, self.dpr, 0.0, 0.0)?;

        // clear
        ctx.set_fill_style_str("#181825"); // gray-75, Catppuccin Mocha mantle
        ctx.fill_rect(0.0, 0.0, self.vw, self.vh);

        // Rows of black keys are darker, as on the keyboard beside the roll
        ctx.set_fill_style_str("#11111b"); // gray-50, Catppuccin Mocha crust
        for pitch in LOWEST_PITCH..=HIGHEST_PITCH {
            if let (true, Some(y)) = (is_black_key(pitch), self.pitch_to_y(pitch)) {
                ctx.fill_rect(0.0, y, self.vw, self.note_height());
            }
        }

        // Rows above the instrument's limit are red while it plays, as notes there don't play at their own pitch
        for (i, &(start, limit)) in self.pitch_limits.iter().enumerate() {
            let Some(limit) = limit else { continue };
            let x = self.time_to_x(start as f64).max(0.0);
            let end = self
                .pitch_limits
                .get(i + 1)
                .map_or(self.vw, |&(end, _)| self.time_to_x(end as f64));
            for pitch in limit.saturating_add(1).max(LOWEST_PITCH)..=HIGHEST_PITCH {
                if let Some(y) = self.pitch_to_y(pitch) {
                    ctx.set_fill_style_str(if is_black_key(pitch) { "#2b1620" } else { "#351b27" });
                    ctx.fill_rect(x, y, (end.min(self.vw) - x).max(0.0), self.note_height());
                }
            }
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

        ctx.set_stroke_style_str("rgb(29 128 245 / 45%)");
        for &(time, pitch, length, _, _) in &self.behind_notes {
            self.draw_note(ctx, time, pitch, length, false);
        }

        // Dashed lines where each branch can switch to another mix's option
        ctx.set_stroke_style_str("rgb(249 226 175 / 35%)"); // Catppuccin Mocha yellow
        let _ = ctx.set_line_dash(&js_sys::Array::of2(&4.0.into(), &4.0.into()));
        ctx.set_line_width(1.0);
        for &time in &self.branch_times {
            let x = self.time_to_x(time as f64);
            ctx.begin_path();
            ctx.move_to(x, 0.0);
            ctx.line_to(x, self.vh);
            ctx.stroke();
        }
        let _ = ctx.set_line_dash(&js_sys::Array::new());
        ctx.set_line_width(2.0);

        ctx.set_stroke_style_str("#1d80f5");
        ctx.set_fill_style_str("#066ce7");
        for &(time, pitch, length, velocity, id) in &self.notes {
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
        let middle = range.start + (range.end - range.start) / 2;
        self.pitch_to_y(middle).unwrap_or(0.0) + self.note_height() / 2.0
    }
}

/// The notes in `played`, with each branch playing the option for proximity mix `mix`.
fn notes(played: &[(usize, Event)], branches: &BTreeMap<BranchId, Branch>, mix: u8) -> Vec<Note> {
    let mut notes = Vec::new();
    for (time, event) in played {
        match event.command {
            Command::Note {
                pitch,
                length,
                velocity,
            } => notes.push((*time, pitch, length, velocity, Some(event.id))),
            Command::Branch { branch } => {
                let Some(branch) = branches.get(&branch) else {
                    continue;
                };
                let option = branch.options.get(mix as usize).or(branch.options.first());
                for (offset, event) in option
                    .map(|option| option.commands.playback(branches))
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

impl Default for PianoRoll {
    fn default() -> Self {
        Self::new()
    }
}
