pub mod text;
pub mod shape;
pub mod btn;
pub mod song;

use crate::display::{Application, draw::*};
pub type Ctx = crate::display::draw::Ctx<Ui>;
use std::path::PathBuf;
use std::sync::mpsc::Sender;
use song::Song;

pub struct Ui {
    hot_reload_tx: Sender<Vec<u8>>,

    open_song: Option<Song>,
    open_file_btn: btn::ButtonState,
    play_btn: btn::ButtonState,
}

impl Ui {
    pub fn new(hot_reload_tx: Sender<Vec<u8>>) -> Self {
        Ui {
            hot_reload_tx,
            open_song: None,
            open_file_btn: Default::default(),
            play_btn: Default::default(),
        }
    }
}

impl Application for Ui {
    fn draw(&mut self, ctx: &mut Ctx, delta: f32) {
        if btn::primary(ctx, delta, rect(0.0, 0.0, 96.0, 32.0), "Open File...", &mut self.open_file_btn) {
            // We use ctx.spawn here to defer opening of the file dialog until after drawing is complete.
            ctx.spawn(|| {
                // Note: we cannot open_file_dialog in this thread; it must be done on the main thread (macOS)
                // This is why we do everything in the below callback.

                move |ui: &mut Self| {
                    let f = tinyfiledialogs::open_file_dialog("Open File", "", Some((&["*.bgm", "*.bin"], "BGM files")));

                    if let Some(f) = f {
                        println!("loading song: {}", f);

                        match Song::open(PathBuf::from(f)) {
                            Ok(song) => ui.open_song = Some(song),
                            Err(error) => {
                                let msg = format!("{}", error);
                                tinyfiledialogs::message_box_ok("Error opening file", &msg, tinyfiledialogs::MessageBoxIcon::Error);
                            },
                        }
                    }
                }
            });
        }

        if let Some(song) = &mut self.open_song {
            song.draw(ctx, delta);

            if btn::primary(ctx, delta, rect(100.0, 0.0, 64.0, 32.0), "Play", &mut self.play_btn) {
                let data = song.bgm.as_bytes().unwrap(); // TODO handle error
                self.hot_reload_tx.send(data).unwrap();
            }
        }
    }
}
