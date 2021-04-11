#![windows_subsystem = "windows"]

fn main() {
    mamar::init();

    let (interface, event_loop) = mamar::interface::Interface::new();
    interface.show(event_loop)
}
