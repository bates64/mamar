pub mod history;
pub mod logger;
pub mod interface;

pub fn init() {
    #[cfg(target_os = "windows")]
    unsafe {
        use winapi::um::*;

        shellscalingapi::SetProcessDpiAwareness(shellscalingapi::PROCESS_SYSTEM_DPI_AWARE);
        wincon::AttachConsole(wincon::ATTACH_PARENT_PROCESS);
    }

    let _ = log::set_logger(&logger::LOGGER);

    if cfg!(debug_assertions) || cfg!(test) {
        log::set_max_level(log::LevelFilter::Debug);
    } else {
        log::set_max_level(log::LevelFilter::Info);
    }
}
