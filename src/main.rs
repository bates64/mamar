#![windows_subsystem = "windows"]

use mamar::*;

fn main() {
    #[cfg(target_os = "windows")]
    unsafe {
        use winapi::um::*;

        shellscalingapi::SetProcessDpiAwareness(2);
        wincon::AttachConsole(wincon::ATTACH_PARENT_PROCESS);
    }

    let (tx, rx) = std::sync::mpsc::channel();

    std::thread::spawn(move || hot::run(rx));

    display::main(ui::Ui::new(tx))
}
