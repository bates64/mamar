use std::rc::Rc;
use cursed_global_ref::cursed;
use wasm_bindgen_futures::spawn_local;
use super::prelude::*;
use super::{TitleBar, StatusBar};
use super::menu::{MenuDesc, MenuItemDesc};
use super::action::*;
use crate::fs::{self, File};
use codec::bgm::Bgm;

pub enum Msg {
    Init,
    Action(Action),
    Open(Open),
    Saved,
}

// Ew, a global variable! What the heck is this doing here!? I thought Rust was meant to be safe!
//
// I think we **need** this one. [spawn_local] requires the 'static lifetime for the Future it will run, which means we
// can't access the surrounding stack context. That means, in order to pass data to/from async blocks, we need a
// 'static, mutable variable: a global variable. This is required anywhere we need to await some JS Promise, for example
// when waiting for the user to select a file to open.
//
// Here's a diagram of the async model:
//
//               UI "thread"                                         Other "thread"
//               --------------------------                          --------------------------
//
//               user clicks "Open File..." ------spawn_local------> await file selection
//                                                                   attempt to decode file
//               App displays the result    <-----send_message------ success/error
//
// If we instead did the file selection await on the UI "thread" (WASM doesn't have real threads), the entire
// application would freeze and become unresponsive until the user picked a file.
//
// ---
//
// I've tried to make a safe wrapper around this global pointer with my
// [cursed_mut_global](../../cursed_mut_global/src/lib.rs) crate.
// The App will live for the entire lifetime of the program, so this should actually be safe.
//
// Despite global variables being "bad," this actually gives us a much nicer way to send messages to the App from
// deeply-nested components without passing event handlers everywhere. This is done using `send_message` to avoid
// the possibility of a component locking `APP` for longer than it has to (which would probably break something).
//
// Here's a helpful diagram of the component tree:
//
//                                                   App             <-----   &APP
//                                                  /   \
//                                                 /     \                      ^
//                                              Child  Child                    |
//                                               /                              |
//                                             ...                              |
//                                             /
//                                        Grandchild                 -----> send_message
//
// Grandchild wants to talk to the App at the root of the tree. It can now do this by calling `ui::app::send_message`!
//
// This avoids:
//   - navigating up the tree until we reach the root (slow)
//   - having to maintain child->parent references (borrow-checker hell)
//   - writing `app=self.props.app.clone()` in every single component that needs to access the root or has children that
//     need to access the root (annoying)
//
// But requires:
//   - there being exactly one App instanciated at all times (but when would we ever need two apps anyway?)
//   - that's it
//
// (TitleBar was implemented before this system was added. Notice how the `onaction` callback has to be repeatedly
// cloned as we descend down the tree - using memory - before being used as a glorified send-message-to-the-app
// function in MenuItem.)
//
// (There may be a better way to do this using yew's agent model, but they're poorly-documented right now and thus
// I have no idea how to use them. There're also context crates for yew, similar to `Context` in the React JS library
// (<https://reactjs.org/docs/context.html>), but this would result in having to bubble the message all the way up the
// tree and thus using `send_message` should be significantly quicker.)
cursed!(pub APP: &mut App);

/// Sends a message to the App without bubbling through the component tree.
/// Returns an `Err` if there is no App running or the link is locked.
pub fn send_message(msg: Msg) -> Result<(), ()> {
    APP.get().map(move |app| {
        app.link.send_message(msg);
    })
}

pub struct App {
    link: ComponentLink<Self>,
    menu: Rc<Vec<MenuDesc>>,
    open: Open,
}

/// Core state machine.
pub enum Open {
    Bgm {
        file: File,
        file_is_bgm: bool,
        bgm: Bgm,
        modified: bool,
    },
    None,
}

impl Component for App {
    type Message = Msg;
    type Properties = ();

    fn create(_: Self::Properties, link: ComponentLink<Self>) -> Self {
        // We can't set APP here, because it would be on the stack. Instead, we do it on Msg::Init, which is sent
        // immediately after mounting in ../lib.rs.

        Self {
            link,
            menu: Rc::new(vec![
                MenuDesc {
                    label: "File",
                    items: vec![
                        /*MenuItemDesc::Accelerator(Accelerator {
                            action: Action::NewFile,
                            key: Key::new("CmdOrCtrl+N"),
                        }),*/
                        MenuItemDesc::Accelerator(Accelerator {
                            action: Action::OpenFile,
                            key: Key::new("CmdOrCtrl+O"),
                        }),

                        MenuItemDesc::Separator,

                        MenuItemDesc::Accelerator(Accelerator {
                            action: Action::Save,
                            key: Key::new("CmdOrCtrl+S"),
                        }),
                        MenuItemDesc::Accelerator(Accelerator {
                            action: Action::SaveAs,
                            key: Key::new("CmdOrCtrl+Shift+S"),
                        }),

                        MenuItemDesc::Separator,

                        MenuItemDesc::Accelerator(Accelerator {
                            action: Action::CloseFile,
                            key: Key::new("CmdOrCtrl+W"),
                        }),

                        MenuItemDesc::Accelerator(Accelerator {
                            action: Action::Quit,
                            key: Key::new(""),
                        }),
                    ]
                },
            ]),
            open: Open::None,
        }
    }

    fn update(&mut self, msg: Self::Message) -> ShouldRender {
        match msg {
            Msg::Init => {
                if APP.is_initialised().unwrap_or(true) {
                    panic!("only one App may be initialised at once");
                }

                APP.set(self).unwrap();
                false
            },
            Msg::Action(action) => {
                log::info!("action: {}", action);

                match action {
                    Action::NewFile => todo!(), // TODO
                    Action::OpenFile => {
                        // TODO: ask user if they're sure if Open { modified: true }
                        spawn_local(async {
                            let file = File::open(fs::bgm_like::FILE_TYPES).await;
                            if let Some(file) = file {
                                let bgm = fs::bgm_like::from_bytes(&file.read().await);

                                match bgm {
                                    Ok((bgm, had_to_convert)) => {
                                        send_message(Msg::Open(Open::Bgm {
                                            file,
                                            file_is_bgm: !had_to_convert,
                                            bgm,
                                            modified: false,
                                        })).unwrap();
                                    },
                                    Err(error) => {
                                        // TODO: show this error to the user
                                        log::error!("{}", error);
                                    },
                                }
                            }
                        });
                        false
                    },
                    Action::Save => {
                        if let Open::Bgm { file_is_bgm, .. } = self.open {
                            if file_is_bgm {
                                spawn_local(async {
                                    let mut app = APP.get().unwrap();

                                    if let Open::Bgm { file, bgm, .. } = &mut app.open {
                                        match bgm.as_bytes() {
                                            Ok(bin) => {
                                                let result = file.save(&bin).await;

                                                drop(app);

                                                if let Err(error) = result {
                                                    // TODO: show this error to the user
                                                    log::error!("{:?}", error);
                                                } else {
                                                    send_message(Msg::Saved).unwrap();
                                                }
                                            },
                                            Err(error) => {
                                                // TODO: show this error to the user
                                                log::error!("{}", error);
                                            },
                                        }
                                    } else {
                                        // ...we just checked this.
                                        unreachable!();
                                    }
                                });
                                false
                            } else {
                                // Delegate to SaveAs. We don't want to overwrite any non-BGM sources with BGM data!
                                log::trace!("delegating Save to SaveAs because open file is not a BGM");
                                self.update(Msg::Action(Action::SaveAs))
                            }
                        } else {
                            log::warn!("ignoring Save because no file is open");
                            false
                        }
                    },
                    Action::SaveAs => {
                        if let Open::Bgm { .. } = self.open {
                            spawn_local(async {
                                let mut app = APP.get().unwrap();

                                if let Open::Bgm { file, bgm, .. } = &mut app.open {
                                    match bgm.as_bytes() {
                                        Ok(bin) => {
                                            // FIXME: this crashes in latest Chrome
                                            let result = file.save_as(&bin).await;

                                            drop(app);

                                            if let Err(error) = result {
                                                // TODO: tell the user that we couldn't write to the file
                                                log::error!("{:?}", error);
                                            } else {
                                                send_message(Msg::Saved).unwrap();
                                            }
                                        },
                                        Err(error) => {
                                            // TODO: show this error to the user
                                            log::error!("{}", error);
                                        },
                                    }
                                } else {
                                    // ...we just checked this.
                                    unreachable!();
                                }
                            });
                            false
                        } else {
                            log::warn!("ignoring SaveAs because no file is open");
                            false
                        }
                    },
                    Action::CloseFile => {
                        // TODO: ask user if they're sure if Open { modified: true }
                        self.open = Open::None;
                        true
                    },
                    Action::Quit => {
                        // TODO: ask user if they're sure if Open { modified: true }
                        web_sys::window().unwrap().close().unwrap();
                        false
                    },
                }
            },
            Msg::Open(open) => {
                self.open = open;
                true
            },
            Msg::Saved => {
                if let Open::Bgm { modified, file_is_bgm, .. } = &mut self.open {
                    *modified = false;
                    *file_is_bgm = true;
                    true
                } else {
                    log::warn!("ignoring Saved because no file is open");
                    false
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
                    title=match &self.open {
                        Open::Bgm { file, modified, .. } => Some(format!(
                            "{}{}",
                            file.name(),
                            match modified {
                                true  => "•",
                                false => "",
                            },
                        )),
                        Open::None => None,
                    },
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

    fn destroy(&mut self) {
        APP.unset().unwrap();
    }
}
