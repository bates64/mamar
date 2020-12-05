use wasm_bindgen::prelude::*;

#[wasm_bindgen(module = "/src/electron/window.js")]
extern "C" {
    pub fn minimize();
    pub fn toggle_maximize();
    pub fn close();
    pub fn on(event: &str, callback: &Closure<dyn FnMut()>);
}
