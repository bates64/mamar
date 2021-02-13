/* pub mod btn; */
pub mod shape;
pub mod song;
//pub mod text;

use std::sync::mpsc::Sender;
use std::time::Duration;

//pub type Ctx = crate::display::draw::Ctx;
use song::Song;

use crate::display::*;
use crate::util::*;

pub struct Ui {
    hot_reload_tx: Sender<Vec<u8>>,

    open_song: Option<Song>,
}

impl Ui {
    pub fn new(hot_reload_tx: Sender<Vec<u8>>) -> Self {
        Ui {
            hot_reload_tx,
            open_song: None,
        }
    }

    pub fn window_title(&self) -> String {
        match &self.open_song {
            None => "Mamar".to_string(),
            Some(song) => format!("{} - Mamar", song.file_name()),
        }
    }

    pub fn draw(&mut self, _delta: Duration) -> DisplayList {
        log::debug!("draw");

        vec![
            Box::new(shape::rect(rect(0.1, 0.1, 0.2, 0.2), color::PURPLE)),
            Box::new(shape::rect(rect(0.0, 0.0, 1.0, 1.0), color::PURPLE)),
        ]

        /*
        shape::rect(ctx, {
            let size = ctx.display_size();
            rect(0.0, 0.0, size.width, size.height)
        }, color::BACKGROUND).draw(ctx);

        ctx.set_window_title(&self.window_title());

        let btn = btn::primary(
            ctx,
            rect(0.0, 0.0, 96.0, 32.0),
            "Open File...",
        );
        btn.draw(ctx);
        if btn.is_click(ctx, MouseButton::Left) {
            // We use ctx.spawn here to defer opening of the file dialog until after drawing is complete.
            ctx.spawn(|| {
                // Note: we cannot open_file_dialog in this thread; it must be done on the main thread (macOS)
                // This is why we do everything in the below callback.

                move |ui: &mut Self| {
                    log::debug!("showing file open dialog");
                    let f =
                        tinyfiledialogs::open_file_dialog("Open File", "", Some((&["*.bgm", "*.bin", "*.mid", "*.midi"], "BGM files")));

                    if let Some(f) = f {
                        log::info!("loading song: {}", f);

                        match Song::open(PathBuf::from(f)) {
                            Ok(song) => ui.open_song = Some(song),
                            Err(error) => {
                                let msg = format!("{}", error);
                                log::error!("{}", msg);
                                tinyfiledialogs::message_box_ok(
                                    "Error opening file",
                                    &msg,
                                    tinyfiledialogs::MessageBoxIcon::Error,
                                );
                            }
                        }
                    } else {
                        log::debug!("user cancelled file open operation");
                    }
                }
            });
        }

        if let Some(song) = &mut self.open_song {
            song.draw(ctx, delta);

            let btn = btn::primary(ctx, rect(100.0, 0.0, 64.0, 32.0), "Play");
            btn.draw(ctx);
            if btn.is_click(ctx, MouseButton::Left) {
                let data = song.bgm.as_bytes().unwrap(); // TODO handle error
                self.hot_reload_tx.send(data).unwrap();
            }

            let btn = btn::primary(ctx, rect(168.0, 0.0, 96.0, 32.0), "Save As...");
            btn.draw(ctx);
            if btn.is_click(ctx, MouseButton::Left) {
                let current_path = song.path.to_string_lossy().to_string();
                ctx.spawn(|| {
                    move |ui: &mut Self| {
                        use std::fs::File;

                        log::debug!("showing file save dialog");
                        let path =
                            tinyfiledialogs::save_file_dialog_with_filter("Save As", &current_path, &["*.bgm", "*.bin"], "");

                        if let Some(path) = path {
                            log::info!("saving bgm to {}", path);
                            let mut f = File::create(&path).unwrap();

                            let song = ui.open_song.as_mut().unwrap();

                            song.path = PathBuf::from(path);
                            song.bgm.encode(&mut f).unwrap();
                        } else {
                            log::debug!("user cancelled file save operation");
                        }
                    }
                });
            }
        }
        */
    }
}
