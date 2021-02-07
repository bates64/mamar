#![windows_subsystem = "windows"]

use mamar::*;

fn main() {
    init();

    log::info!("hello");

    let (tx, rx) = std::sync::mpsc::channel();

    std::thread::spawn(move || hot::run(rx));

    display::main(ui::Ui::new(tx))
}
