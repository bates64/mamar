use yew::prelude::*;
use yewtil::NeqAssign;

#[derive(Clone, Properties, PartialEq)]
pub struct Props {
    #[prop_or_default]
    pub children: Children,
}

/// A component that grows to fill up as much space as it can.
pub struct Grow {
    props: Props,
}

impl Component for Grow {
    type Message = ();
    type Properties = Props;

    fn create(props: Self::Properties, _: ComponentLink<Self>) -> Self {
        Self { props }
    }

    fn update(&mut self, _: Self::Message) -> ShouldRender {
        false
    }

    fn change(&mut self, props: Self::Properties) -> ShouldRender {
        self.props.neq_assign(props)
    }

    fn view(&self) -> Html {
        html! {
            <div class="Grow">
                {self.props.children.clone()}
            </div>
        }
    }
}
