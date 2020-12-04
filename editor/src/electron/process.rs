use wasm_bindgen::prelude::*;

#[wasm_bindgen(module = "/src/electron/platform.js")]
extern "C" {
    pub fn platform() -> String;
}

pub fn is_macos() -> bool {
    platform() == "darwin"
}
