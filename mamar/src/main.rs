#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod display;
mod ui;

fn main() {
    #[cfg(target_os = "windows")]
    unsafe {
        winapi::um::shellscalingapi::SetProcessDpiAwareness(2);
    }

    display::main(ui::Ui::new())
}
