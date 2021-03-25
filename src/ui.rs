pub mod shape;
mod song;
pub mod text;

use std::error::Error;
use std::fmt::{self, Display};
use std::sync::mpsc::Sender;
use std::time::Duration;
use std::path::PathBuf;

use song::Song;

use crate::display::*;
use crate::util::*;

fn button(text: &str, width: f32) -> EntityGroup {
    let mut text = text::label(text, color::WHITE, 14.0);

    let container_box = Box3D::new(point3(0.0, 0.0, 0.0), point3(width, 32.0, 0.0)); //text.bounding_box().inflate(16.0, 16.0, 0.0);
    //container_box.translate(vec3(16.0, 16.0, 0.0));

    text.translate(container_box.center().to_vector());
    text.anchor(point3(0.5, 0.6, 0.5)); // y is off to account for baseline

    let container = geo::Multicolor::build_svg(|path| {
        let color = color::PURPLE.as_rgba_f32();

        path.begin(point(container_box.min.x , container_box.min.y), &color); // top-left
        path.line_to(point(container_box.max.x, container_box.min.y), &color); // top-right
        path.line_to(point(container_box.max.x, container_box.max.y), &color); // bottom-right
        path.line_to(point(container_box.min.x, container_box.max.y), &color); // bottom-left
        path.end(true);
    });

    /*
    // FIXME: alpha channel
    let mut shadow = geo::Multicolor::build_svg(|path| {
        let color = [0.0, 0.0, 0.0, 0.1];

        path.begin(point(container_box.min.x - 1.0 , container_box.min.y + 2.0), &color); // top-left
        path.line_to(point(container_box.max.x + 1.0, container_box.min.y), &color); // top-right
        path.line_to(point(container_box.max.x, container_box.max.y + 2.0), &color); // bottom-right
        path.line_to(point(container_box.min.x + 2.0, container_box.max.y - 2.0), &color); // bottom-left
        path.end(true);
    });
    */

    //shadow.translate(vec3(4.0, 4.0, -1.0)); // Behind container
    text.translate(vec3(0.0, 0.0, 1.0)); // Above container

    let mut root = EntityGroup::with_capacity(2);
    root.add(container);
    //root.add(shadow);
    root.add(text);
    root
}

pub struct Ui {
    hot_reload_tx: Sender<Vec<u8>>,

    open_song: Option<Song>,
}

#[derive(Debug, Clone, Copy)]
struct NoSongOpen;

impl Display for NoSongOpen {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "no song is open")
    }
}

impl Error for NoSongOpen {}

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

    pub fn open_song(&mut self, path: String) {
        log::info!("loading song: {}", path);

        match Song::open(PathBuf::from(path)) {
            Ok(song) => self.open_song = Some(song),
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
    }

    pub fn save_song_as(&mut self, path: String) -> Result<(), Box<dyn Error>> {
        use std::fs::File;

        if let Some(song) = self.open_song.as_mut() {
            log::info!("saving bgm to {}", path);
            let mut f = File::create(&path)?;

            song.path = PathBuf::from(path);
            song.bgm.encode(&mut f)?;

            Ok(())
        } else {
            // No song open???
            Err(Box::new(NoSongOpen))
        }
    }

    pub fn draw(&mut self, _delta: Duration, i: &Input) -> EntityGroup {
        let mut root = EntityGroup::new();

        root.add({
            let mut button = button("Open File...", 128.0);

            if i.is_left_click(&button.bounding_box()) {
                // We cannot open_file_dialog in the UI thread; it must be done on the main thread (specifically, on macOS).
                // This is why we do everything in the below callback.
                button.before_draw(|_, ctx| {
                    log::debug!("showing file open dialog");
                    let f =
                        tinyfiledialogs::open_file_dialog("Open File", "", Some((&["*.bgm", "*.bin", "*.mid", "*.midi"], "BGM or MIDI files")));

                    if let Some(path) = f {
                        // This will eventually route back to `self.open_song(path)`.
                        let _ = ctx.ui_tx.send(UiThreadRequest::OpenSong(path));
                    } else {
                        log::debug!("user cancelled file open operation");
                    }
                });
            }

            button
        });

        if let Some(song) = &self.open_song {
            root.add({
                let mut button = button(&format!("Play {}", song.file_name()), 128.0);
                button.translate(vec3(0.0, 36.0, 0.0));

                if i.is_left_click(&button.bounding_box()) {
                    let _ = self.hot_reload_tx.send(song.bgm.as_bytes().unwrap());
                }

                button
            });

            root.add({
                let mut button = button("Save As...", 128.0);
                button.translate(vec3(0.0, 72.0, 0.0));

                if i.is_left_click(&button.bounding_box()) {
                    let proposed_path = song.path.with_extension("bgm").to_string_lossy().to_string();
                    button.before_draw(move |_, ctx| {
                        log::debug!("showing file save dialog");
                        let path =
                            tinyfiledialogs::save_file_dialog_with_filter("Save As", &proposed_path, &["*.bgm", "*.bin"], "");

                        if let Some(path) = path {
                            // Routes to `self.save_song_as(path)`.
                            let _ = ctx.ui_tx.send(UiThreadRequest::SaveSongAs(path));
                        } else {
                            log::debug!("user cancelled file save operation");
                        }
                    });
                }

                button
            });
        }

        root
    }
}
