#![allow(dead_code)]

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;
use web_sys::Blob;
use js_sys::{ArrayBuffer, Uint8Array};

#[wasm_bindgen(module = "/src/fs.js")]
extern "C" {
    /// Returns Ok(Blob) if the user didn't cancel the operation and opened the file.
    /// Returns Err if not executed from within a user event handler (such as an onclick handler).
    #[wasm_bindgen(catch)]
    async fn open_file(extensions: &str, mime_types: &str) -> Result<JsValue, JsValue>;

    /// Gets the file handle of the most recently accessed file. This is a transparent JsValue to Rust - it cannot be
    /// converted into a cleaner type - and should be passed back into `save_file` at save-time.
    fn recent_file_handle() -> JsValue;

    fn recent_file_name() -> String;

    #[wasm_bindgen(catch)]
    async fn save_file(
        blob: &Blob,
        file_name: &str, // Only used in browsers that lack support for File System Access (e.g. Firefox)
        extensions: &str,
        mime_types: &str,
        handle: &JsValue, // Can be JsValue::UNDEFINED
    ) -> Result<(), JsValue>;
}

/// Both fields should have the same number of values.
#[derive(Debug)]
pub struct FileTypes<'a> {
    /// Space-separated file extensions, e.g. `".js .jsx .ts .tsx"`.
    pub extensions: &'a str,

    /// Space-separated Media Types.
    /// See http://www.iana.org/assignments/media-types/media-types.xhtml
    pub mime_types: &'a str,
}

#[derive(Debug)]
pub struct File {
    name: String,
    blob: Blob,
    handle: JsValue,
    pub types: FileTypes<'static>,
}

impl File {
    pub fn new<S: Into<String>>(name: S, types: FileTypes<'static>) -> Self {
        Self {
            name: name.into(),
            blob: Blob::new().unwrap(),
            handle: JsValue::UNDEFINED,
            types,
        }
    }

    /// Prompts the user to open a file with one of the given `extensions` (space-separated, including ".").
    /// Must be called from within a user event handler. Returns None if the user cancels the operation or some
    /// other error occurs.
    pub async fn open(types: FileTypes<'static>) -> Option<Self> {
        if let Ok(blob) = open_file(types.extensions, types.mime_types).await {
            Some(Self {
                name: recent_file_name(),
                blob: blob.unchecked_into(),
                handle: recent_file_handle(),
                types,
            })
        } else {
            None
        }
    }

    pub fn name<'a>(&'a self) -> &'a str {
        &self.name
    }

    /*
    pub fn set_name<S: Into<String>>(&mut self, new_name: S) {
        self.name = new_name.into();
        self.handle = JsValue::UNDEFINED;
    }
    */

    pub async fn read(&self) -> Vec<u8> {
        let buffer: ArrayBuffer = JsFuture::from(self.blob.array_buffer()).await
            .expect("unable to access array_buffer of file blob")
            .unchecked_into();
        Uint8Array::new(&buffer).to_vec()
    }

    /// Saves the file to disk. May prompt the user for permission (and Err if they say no).
    pub async fn save(&mut self, data: &[u8]) -> Result<(), JsValue> {
        self.blob = Blob::new_with_u8_array_sequence(unsafe { &Uint8Array::view(data) })?;

        save_file(
            &self.blob,
            &self.name,
            &self.types.extensions,
            &self.types.mime_types,
            &self.handle,
        ).await
    }

    /// Saves the file to disk, but prompts the user to change the filename first.
    pub async fn save_as(&mut self, data: &[u8]) -> Result<(), JsValue> {
        self.handle = JsValue::UNDEFINED;

        self.save(data).await?;

        self.handle = recent_file_handle();
        self.name = recent_file_name();

        Ok(())
    }
}
