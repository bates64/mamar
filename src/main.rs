#![windows_subsystem = "windows"]

use std::sync::mpsc::channel;
use std::thread;
use std::time::Instant;

use mamar::display::{Input, MainThreadRequest, UiThreadRequest};
use mamar::ui::Ui;

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
        let mut input = Input::default();

        while let Ok(req) = ui_rx.recv() {
            let mut draw = false;
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
            }

            if draw {
                // Calculate the duration since the last time we drew
                let delta = {
                    let now = Instant::now();
                    let delta = now.duration_since(prev_draw);
                    prev_draw = now;
                    delta
                };

                // Draw, then send the entities to the main thread to actually be rendered
                let root = Box::new(ui.draw(delta, &input));
                let _ = event_loop_proxy.send_event(MainThreadRequest::Draw(root));
            }
        }
    });

    // Main thread - does actual rendering (must be on the main thread)
    mamar::display::init::main(event_loop, ui_tx)
}
