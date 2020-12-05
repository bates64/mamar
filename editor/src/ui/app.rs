use super::prelude::*;
use super::{TitleBar, StatusBar};
use super::menu::{MenuDesc, MenuItemDesc};
use super::action::*;
use std::rc::Rc;

pub enum Msg {
    Action(Action),
}

pub struct App {
    link: ComponentLink<Self>,
    menu: Rc<Vec<MenuDesc>>,
}

impl Component for App {
    type Message = Msg;
    type Properties = ();

    fn create(_: Self::Properties, link: ComponentLink<Self>) -> Self {
        Self {
            link,
            menu: Rc::new(vec![
                MenuDesc {
                    label: "File",
                    items: vec![
                        MenuItemDesc::Accelerator(Accelerator {
                            action: Action::NewFile,
                            keys: vec![Key::Ctrl, Key::N],
                        }),
                        MenuItemDesc::Accelerator(Accelerator {
                            action: Action::OpenFile,
                            keys: vec![Key::Ctrl, Key::O],
                        }),

                        MenuItemDesc::Separator,

                        MenuItemDesc::Accelerator(Accelerator {
                            action: Action::Save,
                            keys: vec![Key::Ctrl, Key::S],
                        }),
                        MenuItemDesc::Accelerator(Accelerator {
                            action: Action::SaveAs,
                            keys: vec![Key::Ctrl, Key::Shift, Key::S],
                        }),

                        MenuItemDesc::Separator,

                        MenuItemDesc::Accelerator(Accelerator {
                            action: Action::Quit,
                            keys: vec![],
                        }),
                    ]
                },
            ]),
        }
    }

    fn update(&mut self, msg: Self::Message) -> ShouldRender {
        match msg {
            Msg::Action(action) => {
                log::info!("action: {}", action);

                match action {
                    Action::Quit => {
                        web_sys::window().unwrap().close().unwrap();
                        false
                    },
                    _ => false, // TEMP
                }
            },
        }
    }

    fn change(&mut self, _: Self::Properties) -> ShouldRender {
        false
    }

    fn view(&self) -> Html {
        html! {
            <VStack color=Color::Black align=Align::SpaceBetween>
                <TitleBar
                    menu=self.menu.clone()
                    onaction={self.link.callback(move |action: Action| Msg::Action(action))}
                />
                <Grow>
                    // TODO: move lib.rs file management
                </Grow>
                <StatusBar/>
            </VStack>
        }
    }
}
