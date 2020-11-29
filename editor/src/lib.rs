#![recursion_limit="1024"] // for html! macro

use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::spawn_local;
use yew::prelude::*;
use std::io::Cursor;
use log::{info, error};
use anyhow::anyhow;
use codec::bgm::{self, Bgm};

mod fs;
use fs::{File, FileTypes};

#[cfg(feature="electron")]
mod electron;

#[cfg(feature = "wee_alloc")]
#[global_allocator]	static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen(start)]
pub fn run_app() {
    #[cfg(debug_assertions)] {
        std::panic::set_hook(Box::new(console_error_panic_hook::hook));
        console_log::init_with_level(log::Level::Debug).unwrap();
        log::debug!("running in debug mode");
    }

    App::<Model>::new().mount_to_body();
}

const FILE_TYPES: FileTypes = FileTypes {
    // TODO: also support .bgm (custom) and .midi
    extensions: ".bin",
    mime_types: "application/octect-stream",
};

#[wasm_bindgen]
pub struct Model {
    link: ComponentLink<Self>,
    file: FileState,

    #[cfg(feature="electron")]
    server: Option<electron::hot_server::HotReloadServer>,
}

// TODO: better name
enum FileState {
    Closed,
    Loading,
    Open(File, Result<Bgm, bgm::de::Error>),
}

impl FileState {
    fn bgm(&self) -> Option<&Bgm> {
        if let FileState::Open(_, Ok(bgm)) = self {
            Some(bgm)
        } else {
            None
        }
    }
}

pub enum Msg {
    #[cfg(feature="electron")] HotServerStart,
    #[cfg(feature="electron")] HotClientConnect,
    #[cfg(feature="electron")] HotClientDisconnect,
    #[cfg(feature="electron")] HotPlayBgm,

    FileOperation(FileOperation),
    FileOperationDone,
    FileLoading,
}

/// A file operation potentially deferring control to the user. If the user is still handling a previous FileOperation
/// message (e.g. they still have the file picker open but click Open File... again) the operation will be silently
/// dropped instead of panicking.
#[derive(Debug)]
pub enum FileOperation {
    /// Defers by opening an open file dialog.
    Open,

    /// May defer to ask the user for write permission to the open file, or display a download dialog.
    Save,

    /// Defers by opening a save file dialog.
    SaveAs,
}

/// Ew, a mutable global variable! What the heck is this doing here!? I didn't know Rust even had these!
///
/// Sadly, I think we need one. [spawn_local] requires the 'static lifetime for the Future it will run, which means we
/// can't access the surrounding stack context. That means, in order to pass data to/from async blocks, we need a
/// 'static, mutable variable... i.e. a global variable (to this module).
///
/// Note: This is incredibly unrusty and bad and I sincerely hope I never ever ever _ever_ have to do it again.
mod cursed {
    use std::cell::Cell;
    use std::sync::Mutex;
    use std::marker::{Send, Sync};
    use std::ops::Deref;
    use lazy_static::lazy_static;
    use super::Model;

    lazy_static! {
        /// Cursed global mutable pointer.
        pub static ref MODEL_PTR: ModelPtr = ModelPtr(Mutex::new(Cell::new(std::ptr::null_mut())));
    }

    /// ModelPtr is a Send+Sync wrapper over...
    ///
    /// ## Mutex<_>
    ///
    /// Mutex is used so we don't accidentally cause data races (e.g. update(Msg::FileOperation) whilst an older
    /// FileOperation's popup is still open). Without this, I doubt anything would necessarily explode [our "threads" on
    /// wasm32-unknown-unknown are JavaScript Promises, which use the syncronous event loop rather than real
    /// threading], but its safer to use a Mutex and it makes the compiler happy.
    ///
    /// ## Mutex<Cell<_>>
    ///
    /// The Cell wrapper provides "interior mutability," which basically allows us to move values in and out of
    /// the MODEL_PTR cell without actually having a mutable global variable (as Rust doesn't have them).
    /// That is, MODEL_PTR is technically a constant ;)
    ///
    /// ### Why not RefCell<Model> instead of Cell<*mut Model>?
    ///
    /// The owner of the Model is the component instance (on the heap); it's not 'static and there could theoretically
    /// be multiple components in existence at once.
    ///
    /// ## Mutex<Cell<*mut Model>>>
    ///
    /// *mut Model is a raw pointer to [Model], so we can read and write to it in 'static contexts (i.e. within
    /// spawn_local threads). Note that dereferencing raw pointers requires an `unsafe` block.
    pub struct ModelPtr(Mutex<Cell<*mut Model>>);

    // We don't have real threads, so we can tell the compiler that ModelPtr is thread-safe (a requirement for statics).
    unsafe impl Send for ModelPtr {}
    unsafe impl Sync for ModelPtr {}

    impl Deref for ModelPtr {
        type Target = Mutex<Cell<*mut Model>>;
        fn deref(&self) -> &Self::Target {
            &self.0
        }
    }
}
use cursed::MODEL_PTR;

impl Model {
    #[cfg(feature="electron")]
    fn is_server_running(&self) -> bool {
        self.server.is_some()
    }

    #[cfg(feature="electron")]
    fn play_bgm(&self) -> Result<(), anyhow::Error> {
        if let Some(bgm) = self.file.bgm() {
            let mut data = Cursor::new(Vec::new());
            if let Err(error) = bgm.encode(&mut data) {
                // We can't return `error` because of lifetime requirements
                error!("{}", error);
                return Err(anyhow!("Failed to encode open BGM"));
            }
            let data = data.into_inner();

            self.server
                .as_ref()
                .expect("hot-reload server is not running")
                .play_bgm(&data[..]);

            Ok(())
        } else {
            Err(anyhow!("No BGM open"))
        }
    }
}

impl Component for Model {
    type Message = Msg;
    type Properties = ();
    fn create(_: Self::Properties, link: ComponentLink<Self>) -> Self {
        Self {
            link,
            file: FileState::Closed,
            #[cfg(feature="electron")]
            server: None,
        }
    }

    fn update(&mut self, msg: Self::Message) -> ShouldRender {
        match msg {
            #[cfg(feature="electron")]
            Msg::HotServerStart => {
                use electron::hot_server::*;

                let hot_client_connect = self.link.callback(|_| Msg::HotClientConnect);
                let hot_client_disconnect = self.link.callback(|_| Msg::HotClientDisconnect);

                self.server = Some(HotReloadServer::start(
                    callback!(move || {
                        info!("hot-reload client connected");
                        hot_client_connect.emit(());
                    }),
                    callback!(move || {
                        info!("hot-reload client disconnected");
                        hot_client_disconnect.emit(());
                    }),
                ));
                true
            },

            #[cfg(feature="electron")]
            Msg::HotPlayBgm => {
                if let Err(error) = self.play_bgm() {
                    error!("{}", error);
                }
                false
            },

            #[cfg(feature="electron")]
            Msg::HotClientConnect | Msg::HotClientDisconnect => true,

            Msg::FileOperation(operation) => {
                // Point MODEL_PTR to self.
                {
                    // We use Mutex::try_lock rather than Mutex::lock because the latter blocks the current thread, and
                    // we only have one thread. That would mean that if the mutex is locked (i.e. a file picker is still
                    // open) we would pause the thread indefinitely - locking up the browser - and never allowing the
                    // code that would unlock the mutex to run.

                    if let Ok(cell) = MODEL_PTR.try_lock() {
                        cell.set(self);
                    } else {
                        // Skip handling this message, because a previous file operation is still in process.
                        // See [FileOperation] for more information.
                        log::warn!("Ignoring {:?} because another operation is still in process", operation);
                        return false;
                    }
                }

                match operation {
                    FileOperation::Open => {
                        spawn_local(async {
                            let cell = MODEL_PTR.try_lock().unwrap();
                            let model = cell.get();

                            if let Some(file) = File::open(FILE_TYPES).await {
                                let link = unsafe { &(*model).link };

                                // Try to parse the file
                                link.send_message(Msg::FileLoading);
                                let bgm = Bgm::decode(&mut Cursor::new(file.read().await));

                                // Remotely update model state
                                unsafe { (*model).file = FileState::Open(file, bgm) };
                                link.send_message(Msg::FileOperationDone);
                            }
                        });

                        return true;
                    },
                    /*
                    FileOperation::Save => spawn_local(async {
                        let cell = MODEL_PTR.try_lock().unwrap();
                        let model = cell.get();

                        let file = unsafe { &mut (*model).file };
                        if let FileState::Open(file, _bgm) = file {
                            // TODO: file.write(_bgm.encode());
                            file.save().await.unwrap();
                        }

                        // No need to schedule re-render
                    }),
                    FileOperation::SaveAs => spawn_local(async {
                        let cell = MODEL_PTR.try_lock().unwrap();
                        let model = cell.get();

                        let file = unsafe { &mut (*model).file };
                        if let FileState::Open(file, _bgm) = file {
                            // TODO: file.write(_bgm.encode());

                            // Show Save As popup. This returns Err if the user aborts, so we just ignore errors.
                            if let Ok(_) = file.save_as().await {
                                // State changed, so schedule a re-render.
                                let link = unsafe { &(*model).link };
                                link.send_message(Msg::FileOperationDone);
                            }
                        }
                    }),
                    */
                    _ => web_sys::window().unwrap().alert_with_message("Not yet implemented :(").unwrap(),
                };
                false
            },
            Msg::FileLoading => {
                self.file = FileState::Loading;
                true
            },
            Msg::FileOperationDone => true,
        }
    }

    fn change(&mut self, _props: Self::Properties) -> ShouldRender {
        false
    }

    fn view(&self) -> Html {
        html! {
            <div class="pad">
                <button-group class="pad">
                    <button class="primary" onclick={self.link.callback(|_| Msg::FileOperation(FileOperation::Open))}>
                        {"Open File..."}
                    </button>
                    {if let FileState::Open(..) = self.file {
                        html! {
                            <>
                                <button onclick={self.link.callback(|_| Msg::FileOperation(FileOperation::Save))}>
                                    {"Save"}
                                </button>
                                <button onclick={self.link.callback(|_| Msg::FileOperation(FileOperation::SaveAs))}>
                                    {"Save As..."}
                                </button>
                            </>
                        }
                    } else {
                        html! {}
                    }}
                </button-group>

                {{
                    #[cfg(feature="electron")]
                    if let Some(server) = &self.server {
                        let num_connections = server.num_connections();

                        html! {
                            <button-group>
                                {if self.file.bgm().is_some() && num_connections > 0 {
                                    html! {
                                        <button onclick={self.link.callback(|_| Msg::HotPlayBgm)}>
                                            {format!(
                                                "Play in {}",
                                                if num_connections == 1 {
                                                    "emulator"
                                                } else {
                                                    "emulators"
                                                }
                                            )}
                                        </button>
                                    }
                                } else {
                                    html! {}
                                }}
                            </button-group>
                        }
                    } else {
                        html! {
                            <button-group>
                                <button onclick={self.link.callback(|_| Msg::HotServerStart)}>
                                    {"Start hot-reload server"}
                                </button>
                            </button-group>
                        }
                    }

                    #[cfg(not(feature="electron"))]
                    html! {}
                }}

                {match &self.file {
                    FileState::Open(file, bgm) => html! {
                        <div class="pad">
                            {format!("Filename: {}", file.name())}
                            <pre>
                                {format!("{:#?}", bgm)}
                            </pre>
                        </div>
                    },
                    FileState::Loading => html! {
                        <div class="pad">
                            {"Loading file..."}
                        </div>
                    },
                    FileState::Closed => html! {},
                }}
            </div>
        }
    }
}

#[test]
fn test() {
    assert!(true);
}
