#![windows_subsystem = "windows"]

use std::sync::mpsc::channel;
use std::thread;

fn main() {
    mamar::init();

    /*
    let (hot_reload_tx, hot_reload_rx) = channel();
    thread::spawn(move || mamar::hot::run(hot_reload_rx));

    let (ui_tx, ui_rx) = channel();
    */

    let (interface, event_loop) = mamar::interface::Interface::new();
    interface.show(event_loop)
}
