#![windows_subsystem = "windows"]

use std::sync::mpsc::channel;
use std::thread;
use std::time::Instant;

use mamar::display::init::{MainThreadRequest, UiThreadRequest};
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

        while let Ok(req) = ui_rx.recv() {
            match req {
                UiThreadRequest::Draw => {
                    // Calculate the duration since the last time we drew
                    let delta = {
                        let now = Instant::now();
                        let delta = now.duration_since(prev_draw);
                        prev_draw = now;
                        delta
                    };

                    let root = Box::new(ui.draw(delta));

                    let _ = event_loop_proxy.send_event(MainThreadRequest::Draw(root));
                } // ...
            }
        }
    });

    // Main thread - does actual rendering (must be on the main thread)
    mamar::display::init::main(event_loop, ui_tx)
}
