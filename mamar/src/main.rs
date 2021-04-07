#![windows_subsystem = "windows"]

use std::sync::mpsc::channel;
use std::thread;
use std::time::Instant;

use mamar::display::{Input, MainThreadRequest, UiThreadRequest, Entity};
use mamar::ui::Ui;
use mamar::util::*;

const SHOW_TIMING_INFO: bool = cfg!(debug_assertions);

fn main() {
    mamar::init();

    log::info!("hello");

    let (hot_reload_tx, hot_reload_rx) = channel();
    thread::spawn(move || mamar::hot::run(hot_reload_rx));

    let (event_loop, event_loop_proxy) = mamar::display::init::create_event_loop();
    let (ui_tx, ui_rx) = channel();

    // UI thread - sends DisplayLists to the main thread for drawing
    thread::spawn(move || {
        let mut prev_draw = Instant::now();
        let mut ui = Ui::new(hot_reload_tx);
        let mut input;

        while let Ok(req) = ui_rx.recv() {
            let draw;
            match req {
                UiThreadRequest::Draw(new_input) => {
                    input = new_input;
                    draw = true;
                }

                UiThreadRequest::OpenSong(path) => {
                    ui.open_song(path);
                    draw = true;
                    input = Input::default(); // Needed so 'Open File...' button doesn't think its been clicked twice
                }

                UiThreadRequest::SaveSongAs(path) => {
                    if let Err(error) = ui.save_song_as(path) {
                        log::error!("error saving song: {}", error);
                    }
                    draw = true;
                    input = Input::default();
                }
            }

            if draw {
                // Calculate the duration since the last time we drew
                let before_draw = Instant::now();
                let delta = {
                    let delta = before_draw.duration_since(prev_draw);
                    prev_draw = before_draw;
                    delta
                };

                // Draw, then send the entities to the main thread to actually be rendered
                let mut root = ui.draw(delta, &input);

                if SHOW_TIMING_INFO {
                    let draw_duration = Instant::now().duration_since(before_draw);

                    let mut rect = mamar::ui::shape::rect_origin(
                        draw_duration.as_secs_f32() * 2000.0,
                        20.0,
                        Color(255, 0, 0, 100),
                    );
                    rect.translate(vec3(0.0, 0.0, 500.0));
                    root.add(rect);
                }

                let _ = event_loop_proxy.send_event(MainThreadRequest::Draw(Box::new(root)));
            }
        }
    });

    // Main thread - does actual rendering (must be on the main thread)
    mamar::display::init::main(event_loop, ui_tx)
}
