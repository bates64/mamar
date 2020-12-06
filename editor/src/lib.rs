#![recursion_limit="1024"] // for html! macro

use wasm_bindgen::prelude::*;
use yew::prelude::*;

mod fs;
mod midi;
mod ui;
mod os;

#[cfg(feature="electron")]
mod electron;

#[cfg(feature = "wee_alloc")]
#[global_allocator]	static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen(start)]
pub fn run_app() {
    #[cfg(debug_assertions)] {
        std::panic::set_hook(Box::new(console_error_panic_hook::hook));
        console_log::init_with_level(log::Level::Debug).unwrap();
        log::info!("os: {}", os::Os::detect());
    }

    let link = App::<ui::app::App>::new().mount_to_body();
    link.send_message(ui::app::Msg::Init);
}

/*
#[wasm_bindgen]
pub struct Model {
    link: ComponentLink<Self>,
    file: FileState,

    error_popup: Option<Box<dyn std::error::Error>>,

    #[cfg(feature="electron")]
    server: Option<electron::hot_server::HotReloadServer>,
}

enum FileState {
    Closed,
    Open(File, Bgm),
}

impl FileState {
    fn bgm(&self) -> Option<&Bgm> {
        if let FileState::Open(_, bgm) = self {
            Some(bgm)
        } else {
            None
        }
    }

    fn handle(&mut self) -> Option<&mut File> {
        if let FileState::Open(file, _) = self {
            Some(file)
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

    ShowError(Box<dyn std::error::Error>),
    CloseError,
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

impl Model {
    #[cfg(feature="electron")]
    fn play_bgm(&self) -> Result<(), anyhow::Error> {
        if let Some(bgm) = self.file.bgm() {
            let mut data = Cursor::new(Vec::new());
            if let Err(error) = bgm.encode(&mut data) {
                // We can't return `error` (TODO)
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
            error_popup: None,
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
                            if let Some(file) = File::open(read_agnostic::FILE_TYPES).await {
                                let cell = MODEL_PTR.try_lock().unwrap();
                                let model = cell.get();
                                let link = unsafe { &(*model).link };

                                // Try to parse the file
                                match read_agnostic(&file.read().await) {
                                    Ok(bgm) => {
                                        // Remotely update model state
                                        unsafe { (*model).file = FileState::Open(file, bgm) };
                                        link.send_message(Msg::FileOperationDone);
                                    },
                                    Err(error) => link.send_message(Msg::ShowError(Box::new(error))),
                                }
                            }
                        });

                        return true;
                    },
                    // TODO? fix on electron
                    FileOperation::Save => spawn_local(async {
                        let cell = MODEL_PTR.try_lock().unwrap();
                        let model = cell.get();

                        let file = unsafe { &mut (*model).file };
                        match file.bgm().unwrap().as_bytes() {
                            Ok(bytes) => file.handle().unwrap().save(&bytes).await.unwrap(),
                            Err(error) => {
                                let link = unsafe { &(*model).link };
                                link.send_message(Msg::ShowError(Box::new(error)));
                            },
                        }
                    }),
                    FileOperation::SaveAs => spawn_local(async {
                        let cell = MODEL_PTR.try_lock().unwrap();
                        let model = cell.get();

                        let file = unsafe { &mut (*model).file };
                        match file.bgm().unwrap().as_bytes() {
                            Ok(bytes) => {
                                // Show Save As popup. This returns Err if the user aborts, so we just ignore errors.
                                if let Ok(_) = file.handle().unwrap().save_as(&bytes).await {
                                    // State changed, so schedule a re-render.
                                    let link = unsafe { &(*model).link };
                                    link.send_message(Msg::FileOperationDone);
                                }
                            },
                            Err(error) => {
                                let link = unsafe { &(*model).link };
                                link.send_message(Msg::ShowError(Box::new(error)));
                            },
                        }
                    }),
                };
                false
            },
            Msg::FileOperationDone => true,

            Msg::ShowError(error) => {
                self.error_popup = Some(error);
                true
            },
            Msg::CloseError => {
                self.error_popup = None;
                true
            },
        }
    }

    fn change(&mut self, _props: Self::Properties) -> ShouldRender {
        false
    }

    fn view(&self) -> Html {
        html! {
            <ui::app::App/>
        }
    }

    fn view(&self) -> Html {
        html! {
            <>
                <Titlebar filename={match &self.file {
                    FileState::Open(file, _) => Some(file.name().clone()),
                    _ => None,
                }}/>

                <div id="body">
                    <button-group class="pad">
                        <button class="pink" onclick={self.link.callback(|_| Msg::FileOperation(FileOperation::Open))}>
                            {Icon::new(IconKind::Upload)}
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

                        {{
                            #[cfg(feature="electron")]
                            if let Some(server) = &self.server {
                                let num_connections = server.num_connections();

                                if self.file.bgm().is_some() && num_connections > 0 {
                                    html! {
                                        <button onclick={self.link.callback(|_| Msg::HotPlayBgm)}>
                                            { Icon::new(IconKind::Play) }
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
                                }
                            } else {
                                html! {
                                    <button onclick={self.link.callback(|_| Msg::HotServerStart)}>
                                        {Icon::new(IconKind::Rss)}
                                        {"Start hot-reload server"}
                                    </button>
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
                            FileState::Closed => html! {},
                        }}
                    </button-group>

                    {if let Some(error) = &self.error_popup {
                        html! {
                            <>
                                <x-popup-shade/>
                                <x-popup>
                                    <span class="padr">{Icon::new(IconKind::IssueOpened)}</span>
                                    {format!("Error: {}", error)}

                                    <br/>

                                    <button-group class="padt"> // TODO: footer of popup
                                        <button class="pink" onclick={self.link.callback(|_| Msg::CloseError)}>
                                            {"Dismiss"}
                                        </button>
                                    </button-group>
                                </x-popup>
                            </>
                        }
                    } else {
                        html! {}
                    }}
                </div>
            </>
        }
    }
}
*/
