use yew::prelude::*;
use yewtil::NeqAssign;

#[cfg(feature="electron")]
use crate::electron;

#[derive(Clone, Properties, PartialEq)]
pub struct Props {
    #[prop_or_default]
    pub filename: Option<String>, // XXX: cloning string from parent when we probably don't need to
}

pub struct Titlebar {
    link: ComponentLink<Self>,
    props: Props,
}

pub enum Msg {
    #[cfg(feature="electron")] Minimize,
    #[cfg(feature="electron")] ToggleMaximize,
    #[cfg(feature="electron")] Close,
}

impl Titlebar {
    fn apply_title(&self) -> String {
        let mut title = String::new();

        if let Props { filename: Some(filename), .. } = &self.props {
            title.push_str(filename);
        }

        // TODO: consider macOS
        if title.len() == 0 {
            title = "Mamar".to_owned();
        } else {
            title.push_str("- Mamar");
        }

        web_sys::window().unwrap().document().unwrap().set_title(&title);

        if cfg!(feature="electron") {
            title
        } else {
            // We've set the window title already, no need to repeat it
            "".to_owned()
        }
    }
}

impl Component for Titlebar {
    type Message = Msg;
    type Properties = Props;

    fn create(props: Self::Properties, link: ComponentLink<Self>) -> Self {
        Self {
            link,
            props,
        }
    }

    fn update(&mut self, msg: Self::Message) -> ShouldRender {
        match msg {
            #[cfg(feature="electron")]
            Msg::Minimize => {
                electron::window::minimize();
                false
            },

            #[cfg(feature="electron")]
            Msg::ToggleMaximize => {
                electron::window::toggle_maximize();
                false
            },

            #[cfg(feature="electron")]
            Msg::Close => {
                electron::window::close();
                false
            },
        }
    }

    fn change(&mut self, props: Self::Properties) -> ShouldRender {
        self.props.neq_assign(props)
    }

    fn view(&self) -> Html {
        let title = self.apply_title();

        // On macOS, we don't use { frame: false } and thus the native titlebar and traffic lights are used.
        // TODO: provide option to use this behaviour on Linux
        #[cfg(feature="electron")]
        if electron::process::is_macos() {
            return html! {};
        }

        // TODO: toolbar support (File, Edit, ...)! At the moment, on non-electron, this element just takes 30px of
        // vertical space for no reason. When on macOS use the native electron API to talk to the OS.

        html! {
            <x-titlebar>
                {{
                    #[cfg(feature="electron")]
                    html! { <x-titlebar-icon/> }

                    #[cfg(not(feature="electron"))]
                    html! {}
                }}

                <x-titlebar-title>
                    {title}
                </x-titlebar-title>

                <x-titlebar-drag-region/>

                // Traffic
                {{
                    #[cfg(feature="electron")]
                    html! {
                        <>
                            <x-titlebar-button class="--minimize" onclick={self.link.callback(|_| Msg::Minimize)}/>
                            <x-titlebar-button class="--maximize" onclick={self.link.callback(|_| Msg::ToggleMaximize)}/>
                            <x-titlebar-button class="--close"    onclick={self.link.callback(|_| Msg::Close)}/>
                        </>
                    }

                    #[cfg(not(feature="electron"))]
                    html! {}
                }}
            </x-titlebar>
        }
    }
}
