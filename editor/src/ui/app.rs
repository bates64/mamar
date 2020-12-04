use super::prelude::*;
use super::StatusBar;

pub struct App {}

impl Component for App {
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
            <VStack color=Color::Black align=Align::SpaceBetween>
                <Text>{"Titlebar"}</Text>
                <Grow>
                    <Text>{"Grow"}</Text>
                </Grow>
                <StatusBar/>
            </VStack>
        }
    }
}
