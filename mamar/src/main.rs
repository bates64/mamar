#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod display;
pub mod ui;

fn main() {
    #[cfg(target_os = "windows")]
    unsafe {
        winapi::um::shellscalingapi::SetProcessDpiAwareness(2);
    }

    let (tx, rx) = std::sync::mpsc::channel();

    std::thread::spawn(move || pmbgm::hot_reload_server::run(rx));

    display::main(ui::Ui::new(tx))
}
