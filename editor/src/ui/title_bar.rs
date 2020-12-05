use super::prelude::*;
use super::menu::{Menu, MenuDesc};
use std::rc::Rc;

#[cfg(feature="electron")]
use crate::electron;

#[derive(Clone, Properties, PartialEq)]
pub struct Props {
    #[prop_or_default]
    pub title: Option<String>, // XXX: cloning string from parent when we probably don't need to

    pub menu: Rc<Vec<MenuDesc>>,
    pub onaction: Callback<super::action::Action>,
}

pub struct TitleBar {
    #[used]
    link: ComponentLink<Self>,
    props: Props,
}

pub enum Msg {
    #[cfg(feature="electron")] Minimize,
    #[cfg(feature="electron")] ToggleMaximize,
    #[cfg(feature="electron")] Close,
}

impl TitleBar {
    fn apply_title(&self) -> String {
        let mut title = String::new();

        if let Props { title: Some(filename), .. } = &self.props {
            title.push_str(filename);
        }

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

impl Component for TitleBar {
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
        let mut render = false;

        if self.props.title != props.title {
            self.props.title = props.title;
            render = true;
        }

        if !Rc::ptr_eq(&self.props.menu, &props.menu) {
            self.props.menu = props.menu;
            render = true;
        }

        if self.props.onaction != props.onaction {
            self.props.onaction = props.onaction;
            render = true;
        }

        render
    }

    fn view(&self) -> Html {
        let title = self.apply_title();

        // On macOS electron, we don't use { frame: false } and thus the native titlebar and traffic lights are used.
        // TODO: provide option to use this behaviour on Linux
        #[cfg(feature="electron")]
        /*if crate::os::Os::detect().is_mac()*/ {
            super::menu::set_application_menu(&self.props.menu);
            //return html! {};
        }

        html! {
            <div class="TitleBar">
                {{
                    #[cfg(feature="electron")]
                    html! { <div class="TitleBarIcon"/> }

                    #[cfg(not(feature="electron"))]
                    html! {}
                }}

                <Menu descriptions=self.props.menu.clone() onaction=self.props.onaction.clone()/>

                <div class="TitleBarTitle">
                    {title}
                </div>

                // Controls (traffic lights)
                {{
                    #[cfg(feature="electron")]
                    html! {
                        <>
                            <div class="TitleBarDragRegion"/> // Grow

                            <div
                                class="TitleBarControl TitleBarControl_minimize"
                                onclick={self.link.callback(|_| Msg::Minimize)}
                            />
                            <div
                                class="TitleBarControl TitleBarControl_maximize"
                                onclick={self.link.callback(|_| Msg::ToggleMaximize)}
                            />
                            <div
                                class="TitleBarControl TitleBarControl_close"
                                onclick={self.link.callback(|_| Msg::Close)}
                            />
                        </>
                    }

                    #[cfg(not(feature="electron"))]
                    html! {}
                }}
            </div>
        }
    }
}
