use yew::prelude::*;
use super::{HStack, VStack, super::css::{Pad, Color, Align}};

#[derive(Clone, Properties, PartialEq)]
pub struct Props {
    pub children: Children,

    #[prop_or_default]
    pub pad: Pad,

    #[prop_or_default]
    pub color: Color,
}

/// A component which centers its children vertically and horizontally.
pub struct Center {
    props: Props,
}

impl Component for Center {
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

    fn change(&mut self, _: Self::Properties) -> ShouldRender {
        false
    }

    fn view(&self) -> Html {
        html! {
            <HStack align=Align::Center pad=self.props.pad color=self.props.color>
                <VStack align=Align::Center pad=Pad::None>
                    {self.props.children.clone()}
                </VStack>
            </HStack>
        }
    }
}
