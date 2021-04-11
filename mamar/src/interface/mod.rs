mod icon;

use imui_glium::*;
use imui_glium::glium::Display;
use imui_glium::glium::glutin::dpi::LogicalSize;
use imui_glium::glium::glutin::event::{ElementState, VirtualKeyCode, ModifiersState};

use crate::history::History;

#[derive(Default, PartialEq, Clone)]
pub struct State {
    clicks: u32,
}

pub struct Interface {
    display: Display,
    glue: Glue,
    state: History<State>,
}

impl Interface {
    pub fn new() -> (Self, EventLoop<()>) {
        let event_loop = EventLoop::new();

        let wb = imui_glium::glium::glutin::window::WindowBuilder::new()
            .with_title("Mamar")
            .with_inner_size(LogicalSize::new(800.0, 600.0))
            .with_min_inner_size(LogicalSize::new(800.0, 600.0))
            .with_window_icon(icon::get_icon())
            .with_visible(false);
        let cb = imui_glium::glium::glutin::ContextBuilder::new()
            .with_multisampling(4)
            .with_srgb(true);
        let display = Display::new(wb, cb, &event_loop).unwrap();

        let mut glue = Glue::new(&display).unwrap();

        glue.atlas().insert("button", "assets/tex/button.png").unwrap();
        glue.atlas().insert("button_pressed", "assets/tex/button_pressed.png").unwrap();

        glue.load_font(include_bytes!("../../../assets/Inter-Medium.otf")).unwrap();

        (Self {
            display,
            glue,
            state: History::new(Default::default()),
        }, event_loop)
    }

    fn update(&mut self) {
        let state = &mut self.state;

        loop {
            self.glue.update(|ui| {
                if ui.button(0, format!("Clicks: {}", state.clicks)) {
                    state.clicks += 1;
                }
            });

            // Re-update if state changed.
            if !state.commit() {
                break;
            }
        }
    }

    /// Keybindings!
    fn handle_key_press(&mut self, key: VirtualKeyCode, modifiers: ModifiersState) {
        match key {
            // Redo
            VirtualKeyCode::Z if modifiers.ctrl() && modifiers.shift() => {
                if self.state.redo() {
                    self.update();
                }
            }

            // Undo
            VirtualKeyCode::Z if modifiers.ctrl() => {
                if self.state.undo() {
                    self.update();
                }
            }

            _ => {}
        }
    }

    fn draw(&mut self) {
        let mut surface = self.display.draw();
        surface.clear_color(0.0, 0.0, 0.0, 1.0);
        self.glue.draw(&mut surface, &self.display).unwrap();
        surface.finish().unwrap();
    }

    pub fn show(mut self, event_loop: EventLoop<()>) -> ! {
        self.update();
        self.draw();
        self.display.gl_window().window().set_visible(true);

        let mut kbd_modifiers = ModifiersState::default();

        event_loop.run(move |event, _, control_flow| {
            *control_flow = ControlFlow::Wait;

            let mut redraw = false;

            match event {
                Event::WindowEvent { event, window_id: _ } => {
                    if self.glue.handle_window_event(&event, &self.display) {
                        self.update();
                    }

                    match event {
                        WindowEvent::KeyboardInput { input, .. } => {
                            if input.state == ElementState::Pressed {
                                if let Some(key) = input.virtual_keycode {
                                    self.handle_key_press(key, kbd_modifiers);
                                }
                            }
                        },
                        WindowEvent::ModifiersChanged(m) => kbd_modifiers = m,
                        WindowEvent::CloseRequested => *control_flow = ControlFlow::Exit,
                        _ => {}
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
