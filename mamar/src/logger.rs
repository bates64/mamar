use log::*;

pub static LOGGER: MyLogger = MyLogger;

pub struct MyLogger;

impl log::Log for MyLogger {
    fn enabled(&self, _: &Metadata) -> bool {
        true
    }

    fn log(&self, record: &Record) {
        // Silence logs from discord-rpc-client because it's really noisy and we don't care about its status
        let is_discord_rpc = record.file().map(|s| s.contains("discord-rpc-client")).unwrap_or_default();
        if is_discord_rpc {
            return;
        }

        let show_file = record.file().is_some()
            && record.line().is_some()
            && (cfg!(debug_assertions) || record.level() != Level::Info);

        if show_file {
            println!(
                "{}:{} {}",
                record.file().unwrap(),
                record.line().unwrap(),
                record.args()
            );
        } else {
            println!("{}", record.args());
        }
    }
    fn flush(&self) {}
}
