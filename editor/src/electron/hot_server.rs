use wasm_bindgen::prelude::*;
use js_sys::Uint8Array;
use log::info;

pub type Callback = Closure<dyn FnMut()>;

#[macro_export]
macro_rules! callback {
    ($f:expr) => {
        Closure::wrap(Box::new($f))
    };
}

#[wasm_bindgen(module = "/src/electron/hot_server.js")]
extern "C" {
    fn server_listen(on_connect: &Callback, on_disconnect: &Callback) -> JsValue;
    fn num_connections(server: &JsValue) -> usize;
    fn hot_bgm(server: &JsValue, data: Uint8Array);
}

#[derive(Debug)]
pub struct HotReloadServer {
    server: JsValue,
    on_connect: Callback,
    on_disconnect: Callback,
}

impl HotReloadServer {
    pub fn start(on_connect: Callback, on_disconnect: Callback) -> Self {
        info!("hot-reload server is starting");

        Self {
            server: server_listen(&on_connect, &on_disconnect),
            on_connect,
            on_disconnect,
        }
    }

    pub fn num_connections(&self) -> usize {
        num_connections(&self.server)
    }

    pub fn play_bgm<T: Into<Uint8Array>>(&self, data: T) {
        hot_bgm(&self.server, data.into());
    }
}
