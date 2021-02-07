#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use mamar::*;

fn main() {
    #[cfg(target_os = "windows")]
    unsafe {
        winapi::um::shellscalingapi::SetProcessDpiAwareness(2);
    }

    let (tx, rx) = std::sync::mpsc::channel();

    std::thread::spawn(move || hot::run(rx));

    display::main(ui::Ui::new(tx))
}
