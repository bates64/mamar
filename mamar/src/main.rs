#![windows_subsystem = "windows"]

fn main() {
    mamar::init();

    match mamar::interface::Interface::new() {
        Ok((interface, event_loop)) => interface.show(event_loop),
        Err(error) => tinyfiledialogs::message_box_ok(
            "Error starting Mamar",
            &format!("{}", error),
            tinyfiledialogs::MessageBoxIcon::Error,
        ),
    }
}
