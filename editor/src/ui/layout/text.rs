use yew::prelude::*;
use yewtil::NeqAssign;
use super::super::css::Color;

#[derive(Clone, Properties, PartialEq)]
pub struct Props {
    pub children: Children,

    #[prop_or_default]
    pub color: Color,

    #[prop_or_default]
    pub selectable: bool,

    /// Enables text wrapping and `\n` handling.
    #[prop_or_default]
    pub multiline: bool,
}

pub struct Text {
    props: Props,
}

impl Component for Text {
    type Message = ();
    type Properties = Props;

    fn create(props: Self::Properties, _: ComponentLink<Self>) -> Self {
        Self {
            props,
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
            <div
                class={
                    let mut class = String::from("Text");

                    if self.props.multiline {
                        class.push_str(" Text_multiline");
                    }

                    if self.props.selectable {
                        class.push_str(" Text_selectable");
                    }

                    class
                },
                style=format!(
                    "color: {};",
                    match self.props.color {
                        // Color which contrasts with the background; should be set whenever --bg is.
                        // Transparent text would be pointless anyway.
                        Color::None => "var(--fg)",

                        // An explicit color.
                        color => color.css_value(),
                    },
                )
            >
                {self.props.children.clone()}
            </div>
        }
    }
}
