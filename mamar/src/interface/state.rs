use std::{error::Error, io::Read};
use std::path::PathBuf;
use std::fs::File;

use pm64::bgm::Bgm;

#[derive(Default, PartialEq, Clone)]
pub struct State {
    pub document: Option<Document>,
}

#[derive(PartialEq, Clone)]
pub struct Document {
    pub bgm: Bgm,
    pub path: PathBuf,
}

impl Document {
    /// Prompt an 'Open File' dialog to open a document. Must be run on the main thread.
    pub fn open() -> Result<Option<Self>, Box<dyn Error>> {
        let path = tinyfiledialogs::open_file_dialog("Open File", "", Some((&[
            "*.bgm",
            "*.mid",
            "*.midi",
            "*.bin",
        ], "BGM and MIDI files")));

        if let Some(path) = path {
            let path = PathBuf::from(path);
            let mut file = File::open(&path)?;

            let bgm;
            if pm64::bgm::midi::is_midi(&mut file)? {
                let mut buf = Vec::new();
                file.read_to_end(&mut buf)?;
                bgm = pm64::bgm::midi::to_bgm(&buf)?;
            } else {
                bgm = Bgm::decode(&mut file)?;
            }

            Ok(Some(Document {
                bgm,
                path,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn can_save(&self) -> bool {
        self.path.ends_with(".bgm") || self.path.ends_with(".bin")
    }

    pub fn save(&self) -> Result<(), Box<dyn Error>> {
        assert!(self.can_save()); // TODO: return Err

        let mut file = File::create(&self.path)?;
        self.bgm.encode(&mut file)?;

        Ok(())
    }

    /// Shows as 'Save As' dialog prompt then saves the document to a file. Must be run on the main thread.
    pub fn save_as(&mut self) -> Result<(), Box<dyn Error>> {
        let current_path = self.path.with_extension("bgm");

        let path = tinyfiledialogs::save_file_dialog_with_filter(
            "Save As",
            current_path.to_str().unwrap_or_default(),
            &["*.bgm"],
            "BGM",
        );

        if let Some(path) = path {
            let mut path = PathBuf::from(path);

            if path.extension().is_none() {
                path.set_extension("bgm");
            }

            std::mem::swap(&mut self.path, &mut path);
            let prev_path = path;

            if self.can_save() {
                self.save()
            } else {
                self.path = prev_path;
                // TODO: probably error
                Ok(())
            }
        } else {
            Ok(())
        }
    }

    pub fn update(&mut self, _ui: &mut imui_glium::UiFrame<'_>) {
        // TODO
    }
}
