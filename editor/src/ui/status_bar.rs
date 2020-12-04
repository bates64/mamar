use super::prelude::*;

pub struct StatusBar {}

impl Component for StatusBar {
    type Message = ();
    type Properties = ();

    fn create(_: Self::Properties, _: ComponentLink<Self>) -> Self {
        Self {}
    }

    fn update(&mut self, _: Self::Message) -> ShouldRender {
        false
    }

    fn change(&mut self, _: Self::Properties) -> ShouldRender {
        false
    }

    fn view(&self) -> Html {
        html! {
            <HStack min_size=Some(1.0) pad=Pad::H(-2.0) spacing=Some(0.0) color=Color::Rose>
                <Text>{"Status bar 1"}</Text>
                <Text>{"Status bar 2"}</Text>
                <Text>{"Status bar 3"}</Text>
                <Grow/>
                <Text>{"Status bar right"}</Text>
            </HStack>
        }
    }
}
