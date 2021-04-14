#![windows_subsystem = "windows"]

use std::time::Duration;

use discord_rpc_client::Client as DiscordClient;

const VERSION: &'static str = env!("CARGO_PKG_VERSION");

fn main() {
    mamar::init();

    // Discord Rich Presence
    std::thread::spawn(|| {
        let mut discord = DiscordClient::new(832001324035342358);

        discord.start();

        loop {
            discord.set_activity(|activity| {
                activity
                    .state(VERSION)
                    .assets(|assets| assets.large_image("logo"))
            }).expect("discord-rpc error");

            std::thread::sleep(Duration::from_secs(10));
        }
    });

    match mamar::interface::Interface::new() {
        Ok((interface, event_loop)) => interface.show(event_loop),
        Err(error) => tinyfiledialogs::message_box_ok(
            "Error starting Mamar",
            &format!("{}", error),
            tinyfiledialogs::MessageBoxIcon::Error,
        ),
    }
}
