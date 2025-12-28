use log::debug;
use pm64::sbn::Sbn;
use pm64::{bgm::*, id::gen_id};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::{io::Cursor, sync::LazyLock};
use wasm_bindgen::prelude::*;

fn to_js<T: Serialize + for<'a> Deserialize<'a>>(t: &T) -> JsValue {
    #[allow(deprecated)]
    JsValue::from_serde(t).unwrap()
}

fn from_js<T: Serialize + for<'a> Deserialize<'a>>(value: &JsValue) -> T {
    #[allow(deprecated)]
    JsValue::into_serde(value).unwrap()
}

#[wasm_bindgen]
pub fn init_logging() {
    console_error_panic_hook::set_once();
    console_log::init_with_level(log::Level::Debug).unwrap();
}

#[wasm_bindgen]
pub fn new_bgm() -> JsValue {
    let bgm = Bgm::new();
    to_js(&bgm)
}

static COMMAND_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"name:\s*".*"(?:.|\n)*?commands:\s*(\[(?:.|\n)*?\])"#).unwrap());

#[wasm_bindgen]
pub fn bgm_decode(data: &[u8]) -> JsValue {
    let mut f = Cursor::new(data);

    if pm64::bgm::midi::is_midi(&mut f).unwrap_or(false) {
        match pm64::bgm::midi::to_bgm(data) {
            Ok(bgm) => to_js(&bgm),
            Err(e) => to_js(&e.to_string()),
        }
    } else if data[0] == b'B' && data[1] == b'G' && data[2] == b'M' && data[3] == b' ' {
        match Bgm::decode(&mut f) {
            Ok(bgm) => to_js(&bgm),
            Err(e) => to_js(&e.to_string()),
        }
    } else {
        let input_string = String::from_utf8_lossy(data);

        let matches: Vec<regex::Captures<'_>> = COMMAND_REGEX.captures_iter(&input_string).collect();
        let mut modified_input_string = input_string.to_string();

        for captures in matches.into_iter().rev() {
            let commands_group = captures.get(1).unwrap();
            let (_, [commands_str]) = captures.extract();

            let commands: Vec<Command> = ron::de::from_str(commands_str).unwrap();
            let events: Vec<Event> = commands
                .into_iter()
                .map(|command| Event { id: gen_id(), command })
                .collect();

            modified_input_string.replace_range(
                commands_group.start()..commands_group.end(),
                &ron::ser::to_string(&events).unwrap(),
            );
        }

        debug!("{}", modified_input_string);

        match ron::from_str::<Bgm>(&modified_input_string) {
            Ok(bgm) => to_js(&bgm),
            Err(e) => to_js(&e.to_string()),
        }
    }
}

#[wasm_bindgen]
pub fn bgm_encode(bgm: &JsValue) -> JsValue {
    let bgm: Bgm = from_js(bgm);
    let mut f = Cursor::new(Vec::new());
    match bgm.encode(&mut f) {
        Ok(_) => {
            let data: Vec<u8> = f.into_inner();
            let arr = js_sys::Uint8Array::new_with_length(data.len() as u32);
            for (i, v) in data.into_iter().enumerate() {
                arr.set_index(i as u32, v);
            }
            arr.into()
        }
        Err(e) => e.to_string().into(),
    }
}

#[wasm_bindgen]
pub fn ron_encode(bgm: &JsValue) -> JsValue {
    let pretty_config = ron::ser::PrettyConfig::new().indentor("  ").depth_limit(5);

    let bgm: Bgm = from_js(bgm);
    let bgm_string = match ron::ser::to_string_pretty(&bgm, pretty_config.clone()) {
        Ok(ron) => ron.to_string(),
        Err(e) => return e.to_string().into(),
    };

    // strip commands of id field
    let matches: Vec<regex::Captures<'_>> = COMMAND_REGEX.captures_iter(&bgm_string).collect();
    let mut modified_bgm_string = bgm_string.clone();

    for captures in matches.into_iter().rev() {
        let events_group = captures.get(1).unwrap();
        let (_, [events_str]) = captures.extract();

        let events: Vec<Event> = ron::de::from_str(events_str).unwrap();
        if events.is_empty() {
            continue;
        }

        let commands: Vec<Command> = events.into_iter().map(|event| event.command).collect();

        let mut commands_string = "[\n".to_owned();
        for line in ron::ser::to_string_pretty(&commands, pretty_config.clone().depth_limit(1))
            .unwrap()
            .lines()
            .skip(1)
        {
            commands_string.push_str("        ");
            commands_string.push_str(line);
            commands_string.push('\n');
        }
        modified_bgm_string.replace_range(
            events_group.start()..events_group.end(),
            &commands_string[..commands_string.len() - 1],
        );
    }

    modified_bgm_string.into()
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
    bgm.instruments.push(Instrument::default());
    to_js(&bgm)
}

#[wasm_bindgen]
pub fn bgm_split_variation_at(bgm: &JsValue, variation: usize, time: usize) -> JsValue {
    let mut bgm: Bgm = from_js(bgm);
    bgm.split_variation_at(variation, time);
    to_js(&bgm)
}
