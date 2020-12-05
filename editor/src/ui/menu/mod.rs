use super::prelude::*;
#[cfg(feature="electron")] use wasm_bindgen::prelude::*;
use std::rc::Rc;
use gloo_events::EventListener;
use super::action::{Accelerator, Action};

pub mod menu_btn;
pub use menu_btn::MenuButton;

pub mod menu_item;
pub use menu_item::MenuItem;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MenuDesc {
    pub label: &'static str,
    pub items: Vec<MenuItemDesc>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MenuItemDesc {
    Accelerator(Accelerator),
    Separator,
}

#[derive(Clone, Properties, PartialEq)]
pub struct Props {
    pub descriptions: Rc<Vec<MenuDesc>>,
    pub onaction: Callback<super::action::Action>,
}

pub struct Menu {
    link: ComponentLink<Self>,
    props: Props,
    active: Option<usize>,

    // We have to hold these event listeners in the struct so their memory isn't dropped whilst we're still using them
    _blur1: EventListener,
    #[cfg(feature="electron")] _blur2: Closure<dyn FnMut()>,
}

pub enum Msg {
    /// Sets the active button index.
    Activate(usize),

    /// Changes the active button to the given index, if one is active already.
    MoveActive(usize),

    Action(Action),

    Deactivate,
}

impl Component for Menu {
    type Message = Msg;
    type Properties = Props;

    fn create(props: Self::Properties, link: ComponentLink<Self>) -> Self {
        Self {
            // Deactivate the active button when a click event bubbles up the the window.
            _blur1: {
                let window = web_sys::window().unwrap();

                let deactivate = link.callback(|_| Msg::Deactivate);
                EventListener::new(&window, "click", move |_| {
                    deactivate.emit(());
                })
            },

            // Deactivate the active button when the electron window is blurred/unfocused.
            #[cfg(feature="electron")]
            _blur2: {
                let deactivate = link.callback(|_| Msg::Deactivate);
                let closure: Closure<dyn FnMut()> = Closure::wrap(Box::new(move || {
                    deactivate.emit(());
                }));

                crate::electron::window::on("blur", &closure);

                closure
            },

            link,
            props,
            active: None,
        }
    }

    fn update(&mut self, msg: Self::Message) -> ShouldRender {
        match msg {
            Msg::Activate(a) => {
                self.active.neq_assign(Some(a))
            },
            Msg::MoveActive(a) => {
                self.active.is_some() && {
                    self.active = Some(a);
                    true
                }
            },
            Msg::Action(action) => {
                self.props.onaction.emit(action);
                self.active.neq_assign(None)
            },
            Msg::Deactivate => self.active.neq_assign(None),
        }
    }

    fn change(&mut self, props: Self::Properties) -> ShouldRender {
        if self.props.neq_assign(props) {
            self.active = None;
            true
        } else {
            false
        }
    }

    fn view(&self) -> Html {
        html! {
            <>
                {for self.props.descriptions
                    .iter()
                    .enumerate()
                    .map(|(i, desc)| {
                        html! {
                            <MenuButton
                                desc=desc
                                active={Some(i) == self.active}
                                onclick={self.link.callback(move |event: MouseEvent| {
                                    event.stop_propagation(); // Don't trigger self.blur1
                                    Msg::Activate(i)
                                })}
                                onmouseover={self.link.callback(move |_| Msg::MoveActive(i))}
                                onaction={self.link.callback(move |action| Msg::Action(action))}
                            />
                        }
                    })
                }
            </>
        }
    }
}

#[cfg(feature="electron")]
pub fn set_application_menu(desc: &[MenuDesc]) {
    // TODO
}
