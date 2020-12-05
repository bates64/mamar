use super::{MenuDesc, MenuItemDesc};
use super::super::action::Action;
use wasm_bindgen::prelude::*;
use js_sys::{Object, Reflect};
use yew::Callback;

#[wasm_bindgen(module = "/src/ui/menu/electron.js")]
extern "C" {
    /// <https://www.electronjs.org/docs/api/menu>
    type Menu;

    #[wasm_bindgen(constructor)]
    fn new() -> Menu;

    #[wasm_bindgen(static_method_of=Menu, js_name=setApplicationMenu)]
    fn set_application_menu(menu: Option<Menu>);

    #[wasm_bindgen(method)]
    fn append(this: &Menu, item: MenuItem);

    /// <https://www.electronjs.org/docs/api/menu-item>
    type MenuItem;

    #[wasm_bindgen(constructor)]
    fn new(options: Object) -> MenuItem;
}

/// Sets the global application menu. The UI will only be shown if the Electron `BrowserWIndow` was instanciated with
/// `{ frame: true }`, but the accelerators (keybindings) will be bound regardless of this setting.
///
/// Note: leaks memory. Don't call this function more than once (we should only need to call it once; at App creation).
pub fn set_application_menu(descriptors: &[MenuDesc], onaction: Callback<Action>) {
    let menu = Menu::new();

    for desc in descriptors {
        menu.append(MenuItem::new({
            let opts = Object::new();
            Reflect::set(&opts, &"label".into(), &desc.label.into()).unwrap();
            Reflect::set(&opts, &"submenu".into(), &{
                let submenu = Menu::new();

                for item in &desc.items {
                    match item {
                        MenuItemDesc::Accelerator(accelerator) => {
                            let action = accelerator.action;
                            let label = format!("{}", action);

                            let onaction = onaction.clone();
                            let click: Closure<dyn FnMut()> = Closure::wrap(Box::new(move || {
                                onaction.emit(action);
                            }));

                            submenu.append(MenuItem::new({
                                let opts = Object::new();

                                // label
                                Reflect::set(&opts, &"label".into(), &label.into()).unwrap();

                                // click (action handler)
                                Reflect::set(
                                    &opts,
                                    &"click".into(),
                                    &click.into_js_value(), // XXX: THIS LEAKS MEMORY!! (don't know how to mitigate this)
                                ).unwrap();

                                // accelerator (keybinding)
                                if let Some(key_str) = accelerator.key.electron_accelerator() {
                                    Reflect::set(
                                        &opts,
                                        &"accelerator".into(),
                                        &key_str.into()
                                    ).unwrap();
                                }

                                opts
                            }));
                        },
                        MenuItemDesc::Separator => {
                            submenu.append(MenuItem::new({
                                let opts = Object::new();
                                Reflect::set(&opts, &"type".into(), &"separator".into()).unwrap();
                                opts
                            }));
                        },
                    }
                }

                submenu
            }.into()).unwrap();
            opts
        }));
    }

    Menu::set_application_menu(Some(menu));
}
