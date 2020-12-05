use super::prelude::*;
use super::{StatusBar, TitleBar};

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
                <TitleBar/>
                <Grow>
                    // TODO: move lib.rs file management
                </Grow>
                <StatusBar/>
            </VStack>
        }
    }
}
