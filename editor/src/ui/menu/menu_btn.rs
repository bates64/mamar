use super::super::prelude::*;
use super::super::action::Action;
use super::{MenuDesc, MenuItem};

#[derive(Clone, Properties, PartialEq)]
pub struct Props {
    pub desc: MenuDesc,
    pub active: bool,

    pub onclick: Callback<MouseEvent>,
    pub onmouseover: Callback<MouseEvent>,
    pub onaction: Callback<Action>,
}

pub struct MenuButton {
    link: ComponentLink<Self>,
    props: Props,
    btn_ref: NodeRef,
}

pub enum Msg {
    /// Does nothing.
    Dummy,
}

impl Component for MenuButton {
    type Message = Msg;
    type Properties = Props;

    fn create(props: Self::Properties, link: ComponentLink<Self>) -> Self {
        Self {
            link,
            props,
            btn_ref: NodeRef::default(),
        }
    }

    fn update(&mut self, _: Self::Message) -> ShouldRender {
        false
    }

    fn change(&mut self, props: Self::Properties) -> ShouldRender {
        self.props.neq_assign(props)
    }

    fn view(&self) -> Html {
        html! {
            <>
                <div
                    ref=self.btn_ref.clone()
                    class={{
                        let mut class = vec!["MenuButton"];
                        if self.props.active {
                            class.push("MenuButton_active");
                        }
                        class
                    }.join(" ")}
                    onclick={self.props.onclick.clone()}
                    onmouseover={self.props.onmouseover.clone()}
                >
                    <HStack pad=Pad::H(-1.5)>
                        {self.props.desc.label}
                    </HStack>
                </div>

                // Submenu
                {if self.props.active {
                    let left = self.btn_ref.cast::<web_sys::HtmlElement>().unwrap().offset_left();

                    html! {
                        <div
                            class="MenuButtonItems"
                            style=format!("left: {}px", left)

                            // Don't cause the submenu to disappear if padding is clicked
                            onclick={self.link.callback(move |event: MouseEvent| {
                                event.stop_propagation();
                                Msg::Dummy
                            })}
                        >
                            <VStack pad=Pad::V(-2.0) color=Color::Grey>
                                {for self.props.desc.items
                                    .iter()
                                    .map(|desc| {
                                        html! {
                                            <MenuItem desc=desc onaction={self.props.onaction.clone()}/>
                                        }
                                    })
                                }
                            </VStack>
                        </div>
                    }
                } else {
                    html! {}
                }}
            </>
        }
    }
}
