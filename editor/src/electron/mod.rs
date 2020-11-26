use wasm_bindgen::prelude::*;
use js_sys::Uint8Array;
use log::{info, warn};

#[wasm_bindgen(module = "/src/electron/mod.js")]
extern "C" {
    pub fn is_electron() -> bool;
    fn server_listen(recieve_callback: &Closure<dyn FnMut(Uint8Array)>);
}

pub type ServerCallback = Closure<dyn FnMut(Uint8Array)>;

pub fn start_server_if_electron(recieve_callback: &ServerCallback) -> bool {
    if !is_electron() {
        warn!("not electron");
        return false;
    }

    info!("starting emulator server");
    server_listen(recieve_callback);

    true
}
