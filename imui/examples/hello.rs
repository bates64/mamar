use std::cell::RefCell;

use ggez::{Context, ContextBuilder, GameResult};
use ggez::event::{self, EventHandler};
use ggez::graphics;
use ui::{Ui, Widget, Rect};

fn main() {
    let (mut ctx, mut event_loop) = ContextBuilder::new("ui_example_hello", "")
        .build()
        .unwrap();

    let mut app = App::new(&mut ctx);

    // Run!
    match event::run(&mut ctx, &mut event_loop, &mut app) {
        Ok(_) => {}
        Err(e) => eprintln!("Error occured: {}", e)
    }
}

struct App {
    ui: RefCell<Ui>,
}

impl App {
    pub fn new(_ctx: &mut Context) -> Self {
        Self {
            ui: RefCell::new(Ui::new()),
        }
    }
}

impl EventHandler for App {
    fn update(&mut self, _ctx: &mut Context) -> GameResult<()> {
        self.ui.borrow_mut().update(|ui| {
            ui.div(0, |ui| {
                ui.set_size(32.0, 32.0);
            });
            ui.div(1, |ui| {
                ui.set_size(64.0, 64.0);
            });
        });

        Ok(())
    }

    fn draw(&mut self, ctx: &mut Context) -> GameResult<()> {
        graphics::clear(ctx, graphics::WHITE);

        let mut color = graphics::Color::from_rgb(0, 120, 120);

        self.ui.borrow().draw_tree(|_, widget: &Widget, rect: &Rect| {
            match widget {
                Widget::Div => {
                    let mesh = graphics::Mesh::new_rectangle(
                        ctx,
                        graphics::DrawMode::fill(),
                        ggez::graphics::Rect::new(rect.origin.x, rect.origin.y, rect.width(), rect.height()),
                        color,
                    ).unwrap();

                    color.r += 0.4;

                    graphics::draw(ctx, &mesh, graphics::DrawParam::default()).unwrap();
                }

                _ => unimplemented!()
            }
        });

        graphics::present(ctx)
    }
}
