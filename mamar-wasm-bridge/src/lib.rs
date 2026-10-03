mod piano_roll;

use pm64::bgm::*;
use pm64::sbn::Sbn;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io::Cursor;
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
            Err(e) => {
                log::error!("Error decoding BGM: {:?}", e);
                to_js(&e.to_string())
            }
        }
    } else {
        let input_string = String::from_utf8_lossy(data);

        match Bgm::from_ron_string(&input_string) {
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
    let bgm: Bgm = from_js(bgm);

    match bgm.to_ron_string() {
        Ok(ron) => ron.into(),
        Err(e) => e.to_string().into(),
    }
}

#[wasm_bindgen]
pub fn sbn_decode(sbn: &[u8]) -> JsValue {
    let mut f = Cursor::new(sbn);
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

/// Returns `commands` with detours replaced by the commands they play. See [CommandSeq::without_detours].
#[wasm_bindgen]
pub fn commands_without_detours(commands: &JsValue) -> JsValue {
    let commands: CommandSeq = from_js(commands);
    to_js(&commands.without_detours())
}

/// Returns `commands` with `command` inserted after the commands already at `time`.
#[wasm_bindgen]
pub fn commands_insert(commands: &JsValue, time: usize, command: &JsValue) -> JsValue {
    let mut commands: CommandSeq = from_js(commands);
    commands.insert_after(time, from_js::<Command>(command));
    to_js(&commands)
}

/// Returns `track_list` changed to play for `time` ticks. See [TrackList::set_len_time].
#[wasm_bindgen]
pub fn track_list_set_length(track_list: &JsValue, time: usize) -> JsValue {
    let mut track_list: TrackList = from_js(track_list);
    track_list.set_len_time(time);
    to_js(&track_list)
}

/// Returns `commands` with the event with ID `id` moved to `time` and given `command`. See [CommandSeq::place].
#[wasm_bindgen]
pub fn commands_place(commands: &JsValue, id: u32, time: usize, command: &JsValue) -> JsValue {
    let mut commands: CommandSeq = from_js(commands);
    commands.place(id, time, from_js::<Command>(command));
    to_js(&commands)
}

/// Returns the voices each track of `track_list` needs and gets, and where each needs them as proximity mix `mix`
/// plays it. See [TrackList::voice_report].
#[wasm_bindgen]
pub fn track_list_voice_report(track_list: &JsValue, branches: &JsValue, mix: usize) -> JsValue {
    let track_list: TrackList = from_js(track_list);
    let branches: BTreeMap<BranchId, Branch> = from_js(branches);
    to_js(&track_list.voice_report(&branches, mix))
}

/// Returns `commands` with notes held a little into the next shortened. See [CommandSeq::trim_short_overlaps].
#[wasm_bindgen]
pub fn commands_trim_short_overlaps(commands: &JsValue, branches: &JsValue) -> JsValue {
    let mut commands: CommandSeq = from_js(commands);
    let branches: BTreeMap<BranchId, Branch> = from_js(branches);
    commands.trim_short_overlaps(&branches);
    to_js(&commands)
}

/// Returns what `commands` play in proximity mix `mix`. See [CommandSeq::for_mix].
#[wasm_bindgen]
pub fn commands_for_mix(commands: &JsValue, branches: &JsValue, mix: usize) -> JsValue {
    let commands: CommandSeq = from_js(commands);
    let branches: BTreeMap<BranchId, Branch> = from_js(branches);
    to_js(&commands.for_mix(&branches, mix))
}

/// Commands and the branches they play, as the functions that change both return them.
#[derive(Serialize, Deserialize)]
struct Branching {
    commands: CommandSeq,
    branches: BTreeMap<BranchId, Branch>,
}

/// Returns `commands` and `branches` with `played` written back into them for mix `mix`. See
/// [CommandSeq::set_for_mix].
#[wasm_bindgen]
pub fn commands_set_for_mix(commands: &JsValue, branches: &JsValue, mix: usize, played: &JsValue) -> JsValue {
    let mut commands: CommandSeq = from_js(commands);
    let mut branches: BTreeMap<BranchId, Branch> = from_js(branches);
    commands.set_for_mix(&mut branches, mix, &from_js(played));
    to_js(&Branching { commands, branches })
}

/// Returns `commands` and `branches` with the commands playing a passage of their own in each of `mixes` mixes. See
/// [CommandSeq::vary_by_mix].
#[wasm_bindgen]
pub fn commands_vary_by_mix(
    commands: &JsValue,
    branches: &JsValue,
    interval: usize,
    mixes: usize,
    is_drum_track: bool,
) -> JsValue {
    let mut commands: CommandSeq = from_js(commands);
    let mut branches: BTreeMap<BranchId, Branch> = from_js(branches);
    commands.vary_by_mix(&mut branches, interval, mixes, is_drum_track);
    to_js(&Branching { commands, branches })
}

/// Returns `bgm` with another proximity mix. See [Bgm::add_mix].
#[wasm_bindgen]
pub fn bgm_add_mix(bgm: &JsValue) -> JsValue {
    let mut bgm: Bgm = from_js(bgm);
    bgm.add_mix();
    to_js(&bgm)
}

/// Returns `bgm` without proximity mix `mix`. See [Bgm::remove_mix].
#[wasm_bindgen]
pub fn bgm_remove_mix(bgm: &JsValue, mix: usize) -> JsValue {
    let mut bgm: Bgm = from_js(bgm);
    bgm.remove_mix(mix);
    to_js(&bgm)
}

/// Returns `bgm` without the branches no track plays.
#[wasm_bindgen]
pub fn bgm_remove_unplayed_branches(bgm: &JsValue) -> JsValue {
    let mut bgm: Bgm = from_js(bgm);
    bgm.remove_unplayed_branches();
    to_js(&bgm)
}

/// Returns a copy of `commands` with new IDs.
#[wasm_bindgen]
pub fn commands_copy(commands: &JsValue) -> JsValue {
    let commands: CommandSeq = from_js(commands);
    let copy: CommandSeq = commands
        .iter()
        .map(|event| Event::from(event.command.clone()))
        .collect();
    to_js(&copy)
}

#[wasm_bindgen]
pub fn bgm_split_variation_at(bgm: &JsValue, variation: usize, time: usize) -> JsValue {
    let mut bgm: Bgm = from_js(bgm);
    bgm.split_variation_at(variation, time);
    to_js(&bgm)
}

/// An object with the given properties.
fn object(properties: &[(&str, JsValue)]) -> JsValue {
    let object = js_sys::Object::new();
    for (key, value) in properties {
        js_sys::Reflect::set(&object, &JsValue::from_str(key), value).unwrap();
    }
    object.into()
}

fn bytes(data: &[u8]) -> JsValue {
    js_sys::Uint8Array::from(data).into()
}

/// Makes a song from the MIDI file `data`, named `name`, linked to it so it can be reimported. Returns `{ bgm, base,
/// warnings }`, where `base` is the import to keep while the song is open, or an error message.
#[wasm_bindgen]
pub fn midi_import(data: &[u8], name: &str) -> JsValue {
    match reimport::import(data, name) {
        Ok(imported) => object(&[
            ("bgm", to_js(&imported.bgm)),
            ("base", bytes(&reimport::encode_timeline(&imported.base))),
            ("warnings", to_js(&imported.warnings)),
        ]),
        Err(e) => e.to_string().into(),
    }
}

/// Returns `bgm` with its import link's patch set to what was changed since the last import, `base`. Call it before
/// saving. Returns `bgm` unchanged if it isn't linked or `base` can't be read.
#[wasm_bindgen]
pub fn import_patch(bgm: &JsValue, base: &[u8]) -> JsValue {
    let mut bgm: Bgm = from_js(bgm);
    if let Some(link) = reimport::decode_timeline(base).and_then(|base| reimport::with_patch(&bgm, &base)) {
        bgm.import = Some(link);
    }
    to_js(&bgm)
}

/// Rebuilds the last import of an opened song from its patch, or returns undefined if it can't be.
#[wasm_bindgen]
pub fn import_base_rebuild(bgm: &JsValue) -> JsValue {
    let bgm: Bgm = from_js(bgm);
    match reimport::rebuild_base(&bgm) {
        Some(base) => bytes(&reimport::encode_timeline(&base)),
        None => JsValue::UNDEFINED,
    }
}

/// Reimports the MIDI file `data`, named `name`, into `bgm`, given its last import `base` if it has one. Returns
/// `{ bgm, base, report }`, or an error message.
#[wasm_bindgen]
pub fn bgm_reimport(bgm: &JsValue, base: Option<Vec<u8>>, data: &[u8], name: &str) -> JsValue {
    let bgm: Bgm = from_js(bgm);
    let base = base.as_deref().and_then(reimport::decode_timeline);
    match reimport::reimport(&bgm, base.as_ref(), data, name) {
        Ok((bgm, base, report)) => object(&[
            ("bgm", to_js(&bgm)),
            ("base", bytes(&reimport::encode_timeline(&base))),
            ("report", to_js(&report)),
        ]),
        Err(e) => e.to_string().into(),
    }
}

/// A ROM's sound bank, kept in wasm memory so looking up its instruments doesn't copy it each time. See
/// [pm64::sbn::bank::SoundBank].
#[wasm_bindgen(js_name = SoundBank)]
pub struct WasmSoundBank(pm64::sbn::bank::SoundBank);

#[wasm_bindgen(js_class = SoundBank)]
impl WasmSoundBank {
    #[wasm_bindgen(constructor)]
    pub fn new(data: &[u8]) -> Self {
        Self(pm64::sbn::bank::SoundBank::new(data.to_vec()))
    }

    pub fn file_name(&self, index: usize) -> Option<String> {
        self.0.file_name(index)
    }

    pub fn file_index_of(&self, name: &str) -> Option<usize> {
        self.0.file_index_of(name)
    }

    pub fn kit_drums(&self) -> JsValue {
        to_js(&self.0.kit_drums())
    }

    pub fn instrument_offset(&self, patch: &JsValue, aux_banks: &JsValue) -> Option<usize> {
        self.0
            .instrument_offset(&from_js(patch), &from_js::<Vec<String>>(aux_banks))
    }

    pub fn envelopes(&self, patch: &JsValue, aux_banks: &JsValue) -> JsValue {
        to_js(&self.0.envelopes(&from_js(patch), &from_js::<Vec<String>>(aux_banks)))
    }
}
