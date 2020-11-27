use wasm_bindgen::prelude::*;
use js_sys::Uint8Array;
use log::info;

#[wasm_bindgen(module = "/src/electron/mod.js")]
extern "C" {
    pub fn is_electron() -> bool;
    fn server_listen(recieve_callback: &Closure<dyn FnMut(Uint8Array)>) -> JsValue;
    fn server_send(server: &JsValue, data: Uint8Array);
}

pub type RecieveCallback = Closure<dyn FnMut(Uint8Array)>;

#[derive(Debug)]
pub struct EmulatorServer {
    recieve_callback: RecieveCallback,
    server: JsValue,
}

impl EmulatorServer {
    pub fn start(recieve_callback: RecieveCallback) -> Result<Self, ()> {
        if !is_electron() {
            return Err(());
        }

        info!("EmulatorServer is starting");

        Ok(Self {
            server: server_listen(&recieve_callback),
            recieve_callback,
        })
    }

    pub fn send<T: Into<Uint8Array>>(&self, data: T) {
        server_send(&self.server, data.into());
    }
}
