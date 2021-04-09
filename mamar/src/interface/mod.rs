mod icon;

use imui_glium::*;
use imui_glium::glium::Display;
use imui_glium::glium::glutin::dpi::LogicalSize;

#[derive(Default)]
pub struct State {
    clicks: u32,
}

pub struct Interface {
    display: Display,
    glue: Glue,
    state: State,
}

impl Interface {
    pub fn new() -> (Self, EventLoop<()>) {
        let event_loop = EventLoop::new();

        let wb = imui_glium::glium::glutin::window::WindowBuilder::new()
            .with_title("Mamar")
            .with_inner_size(LogicalSize::new(800.0, 600.0))
            .with_window_icon(icon::get_icon());
        let cb = imui_glium::glium::glutin::ContextBuilder::new()
            .with_multisampling(4)
            .with_srgb(true);
        let display = Display::new(wb, cb, &event_loop).unwrap();

        let glue = Glue::new(&display).unwrap();

        (Self {
            display,
            glue,
            state: Default::default(),
        }, event_loop)
    }

    fn update(&mut self) {
        let state = &mut self.state;

        self.glue.update(|ui| {
            state.clicks += 1;

            ui.div(0, |ui| {
                ui.set_size(100.0, 32.0);
            });

            ui.div(1, |ui| {
                ui.set_size(200.0, 64.0);
            });
        });
    }

    fn draw(&mut self) {
        let mut surface = self.display.draw();
        surface.clear_color(0.0, 0.0, 0.0, 1.0);
        self.glue.draw(&mut surface).unwrap();
        surface.finish().unwrap();
    }

    pub fn show(mut self, event_loop: EventLoop<()>) -> ! {
        self.update();
        self.draw();

        event_loop.run(move |event, _, control_flow| {
            *control_flow = ControlFlow::Wait;

            let mut redraw = false;

            match event {
                Event::WindowEvent { event, window_id: _ } => {
                    if self.glue.handle_window_event(&event, &self.display) {
                        self.update();
                    }

                    if let WindowEvent::CloseRequested = event {
                        *control_flow = ControlFlow::Exit;
                    }
                }
                Event::RedrawRequested(_window_id) => {
                    redraw = true;
                }
                _ => {}
            }

            if self.glue.needs_redraw() || redraw {
                self.draw();
            }
        })
    }
}
