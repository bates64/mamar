use yew::prelude::*;
use yewtil::NeqAssign;
use super::{ratio, super::css::{Pad, Color, Align}};

#[derive(Clone, Properties, PartialEq)]
pub struct Props {
    #[prop_or_default]
    pub children: Children,

    /// Controls the spacing between child elements.
    #[prop_or_default]
    pub spacing: Option<f32>,

    /// Controls the alignment of the stack's children.
    ///
    /// For a [`VStack`](VStack), this controls **horizontal** alignment (i.e. `<VStack align=Align::Center>` produces
    /// a column of horizontally-centered elements).
    ///
    /// For an [`HStack`](HStack), this controls **vertical** alignment.
    #[prop_or_default]
    pub align: Align,

    /// Controls the stack's outer padding. This creates a margin of empty space in the outermost part of the stack.
    #[prop_or_default]
    pub pad: Pad,

    /// Controls the stack's background color.
    #[prop_or_default]
    pub color: Color,

    /// Controls the stack's minimum size (width or height).
    #[prop_or_default]
    pub min_size: Option<f32>,
}

/// A horizontal line of elements, like SwiftUI's [HStack].
///
/// [HStack]: https://developer.apple.com/documentation/swiftui/hstack
pub struct HStack {
    props: Props,
}

impl Component for HStack {
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
                class="Stack HStack"
                style=format!(
                    "--spacing: {}; {} --padding: {}; {} {} min-height: {};",
                    ratio(self.props.spacing),
                    self.props.align.css(),
                    self.props.pad.css_value(),
                    self.props.color.fg(),
                    self.props.color.bg(),
                    ratio(self.props.min_size),
                )
            >
                {self.props.children.clone()}
            </div>
        }
    }
}

/// A vertical line of elements, like SwiftUI's [VStack].
///
/// [VStack]: https://developer.apple.com/documentation/swiftui/vstack
pub struct VStack {
    props: Props,
}

impl Component for VStack {
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
                class="Stack VStack"
                style=format!(
                    "--spacing: {}; {} --padding: {}; {} {} min-height: {};",
                    ratio(self.props.spacing),
                    self.props.align.css(),
                    self.props.pad.css_value(),
                    self.props.color.fg(),
                    self.props.color.bg(),
                    ratio(self.props.min_size),
                )
            >
                {self.props.children.clone()}
            </div>
        }
    }
}
