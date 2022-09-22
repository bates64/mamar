use serde::{Serialize, Deserialize};
use wasm_bindgen::prelude::*;
use pm64::bgm::*;
use pm64::sbn::Sbn;
use std::io::Cursor;

fn to_js<T: Serialize + for<'a> Deserialize<'a>>(t: &T) -> JsValue {
    #[allow(deprecated)]
    JsValue::from_serde(t).unwrap()
}

fn from_js<T: Serialize + for<'a> Deserialize<'a>>(value: &JsValue) -> T {
    #[allow(deprecated)]
    JsValue::into_serde(value).unwrap()
}

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
pub fn init_logging() {
    console_error_panic_hook::set_once();
    console_log::init_with_level(log::Level::Trace).unwrap();
}

#[wasm_bindgen]
pub fn new_bgm() -> JsValue {
    let bgm = Bgm::new();
    to_js(&bgm)
}

#[wasm_bindgen]
pub fn bgm_decode(data: &[u8]) -> JsValue {
    let mut f = Cursor::new(data);
    match Bgm::decode(&mut f) {
        Ok(bgm) => to_js(&bgm),
        Err(e) => to_js(&e.to_string()),
    }
}

#[wasm_bindgen]
pub fn sbn_decode(rom: &[u8]) -> JsValue {
    const SBN_START: usize = 0xF00000;
    const SBN_END: usize = SBN_START + 0xA42C40;

    let mut f = Cursor::new(&rom[SBN_START..SBN_END]);
    match Sbn::decode(&mut f) {
        Ok(sbn) => to_js(&sbn),
        Err(e) => to_js(&e.to_string()),
    }
}

#[wasm_bindgen]
pub fn bgm_add_voice(bgm: &JsValue) -> JsValue {
    let mut bgm: Bgm = from_js(bgm);
    log::info!("bgm_add_voice {:?}", bgm);
    bgm.voices.push(Voice::default());
    to_js(&bgm)
}
