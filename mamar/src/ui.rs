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
            ctx.spawn(|| {
                // TODO: test on macOS, apparently it only likes file dialogs being opened on the main thread (how?)
                // XXX: this is really slow for some reason
                let f = tinyfiledialogs::open_file_dialog("Open File", "", Some((&["*.bgm", "*.bin"], "BGM files")));

                move |ui: &mut Self| {
                    if let Some(f) = f {
                        // XXX: this decoding should probably be done in the thread, not in this callback
                        // TODO: display error
                        ui.open_song = Some(Song::open(PathBuf::from(f)).unwrap());
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
