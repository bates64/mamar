use super::super::prelude::*;
use super::super::action::Action;
use super::MenuItemDesc;

#[derive(Clone, Properties, PartialEq)]
pub struct Props {
    pub desc: MenuItemDesc,
    pub onaction: Callback<Action>,
}

pub struct MenuItem {
    link: ComponentLink<Self>,
    props: Props,
}

pub enum Msg {
    EmitAction,
}

impl Component for MenuItem {
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
            Msg::EmitAction => match &self.props.desc {
                MenuItemDesc::Accelerator(accelerator) => {
                    self.props.onaction.emit(accelerator.action.clone());
                    false
                },
                _ => false,
            },
        }
    }

    fn change(&mut self, props: Self::Properties) -> ShouldRender {
        self.props.neq_assign(props)
    }

    fn view(&self) -> Html {
        match &self.props.desc {
            MenuItemDesc::Accelerator(accelerator) => html! {
                <div class="MenuItem" onclick={self.link.callback(move |_| Msg::EmitAction)}>
                    <HStack pad=Pad::H(0.0) align=Align::SpaceBetween spacing=Some(2.0)>
                        <span>
                            {format!("{}", accelerator.action)}
                        </span>
                        <span style="opacity: 0.5">
                            {format!("{}", accelerator.key)}
                        </span>
                    </HStack>
                </div>
            },
            MenuItemDesc::Separator => html! {
                <VStack min_size=Some(-1.0)/>
            },
        }
    }
}
