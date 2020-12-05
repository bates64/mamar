use super::{MenuDesc, MenuItemDesc};
use super::super::action::{Action, Accelerator};
use wasm_bindgen::prelude::*;
use yew::Callback;

#[wasm_bindgen(module = "/src/ui/menu/web.js")]
extern "C" {
    fn bind_key(key: &str, callback: JsValue);
    fn unbind_all();
}

/// Binds the accelerators (keyboard shortcuts) in the given menu to keypress events on the document.
///
/// Note: leaks memory. Don't call this function more than once (we should only need to call it once; at App creation).
/// This could be avoided here on web, but there's not much point doing that until the electron version of this function
/// is made to not leak memory either (and I'm not sure how to fix it there). The solution on web would be to return a
/// struct wrapping some kind of area which holds all the Closures passed to `bind_key`, whereby `unbind_all` is
/// called when the struct is dropped.
pub fn set_application_menu(descriptors: &[MenuDesc], onaction: Callback<Action>) {
    unbind_all();

    for desc in descriptors {
        for item in &desc.items {
            if let MenuItemDesc::Accelerator(Accelerator { action, key }) = item {
                if let Some(key) = key.electron_accelerator() {
                    let onaction = onaction.clone();
                    let action = action.clone();

                    let click: Closure<dyn FnMut()> = Closure::wrap(Box::new(move || {
                        onaction.emit(action);
                    }));

                    bind_key(key, click.into_js_value()); // XXX: leaks memory
                }
            }
        }
    }
}

