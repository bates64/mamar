mod icon;
mod state;
mod form;

use std::sync::mpsc::{channel, Sender};
use std::thread;
use std::error::Error;

use imui_glium::*;
use imui_glium::glium::Display;
use imui_glium::glium::glutin::window::Window;
use imui_glium::glium::glutin::dpi::LogicalSize;
use imui_glium::glium::glutin::event::{ElementState, VirtualKeyCode, ModifiersState};

use crate::history::History;

pub struct Interface {
    display: Display,
    glue: Glue,

    state: History<state::State>,

    // TODO: use an actor or something so we can ask it who is connected
    hot_reload_tx: Option<Sender<Vec<u8>>>,

    queued_action: Action,
}

/// UI things that can't happen during updates, like opening file dialogs.
#[derive(Clone)]
enum Action {
    None,
    OpenDocument,
    SaveDocument,
    SaveDocumentAs,
    ReloadDocument,
}

impl Interface {
    pub fn new() -> Result<(Self, EventLoop<()>), Box<dyn Error>> {
        use std::io::prelude::*;
        use std::fs::File;

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
        let display = Display::new(wb, cb, &event_loop)?;

        let mut glue = Glue::new(&display)?;

        log::info!("loading assets");

        glue.atlas().insert("button", "assets/tex/button.png")?;
        glue.atlas().insert("button_pressed", "assets/tex/button_pressed.png")?;
        glue.atlas().insert("toggle_button_on", "assets/tex/toggle_button_on.png")?;
        glue.atlas().insert("toggle_button_on_pressed", "assets/tex/toggle_button_on_pressed.png")?;
        glue.atlas().insert("toggle_button_off", "assets/tex/toggle_button_off.png")?;
        glue.atlas().insert("toggle_button_off_pressed", "assets/tex/toggle_button_off_pressed.png")?;
        glue.atlas().insert("window", "assets/tex/window.png")?;

        glue.load_font(&{
            let mut font = File::open("assets/Inter-Medium.otf")?;
            let mut buf = Vec::new();
            font.read_to_end(&mut buf)?;
            buf
        })?;

        Ok((Self {
            display,
            glue,
            state: History::new(Default::default()),
            hot_reload_tx: None,
            queued_action: Action::None,
        }, event_loop))
    }

    pub fn with_window<F: FnOnce(&Window)>(&self, f: F) {
        f(self.display.gl_window().window())
    }

    fn update(&mut self) {
        let state = &mut self.state;
        let hot_reload_tx = &mut self.hot_reload_tx;
        let queued_action = &mut self.queued_action;

        let mut updates = 0;
        loop {
            updates += 1;

            self.glue.update(|ui| {
                ui.vbox(0, |ui| {
                    ui.hbox(0, |ui| {
                        // Hot-reload server controls.
                        if hot_reload_tx.is_none() {
                            if ui.button(0, "Start playback server")
                                .with_width(200.0)
                                .clicked()
                            {
                                let (tx, hot_reload_rx) = channel();

                                thread::spawn(move || pm64::hot::run(hot_reload_rx));

                                *hot_reload_tx = Some(tx);
                            }
                        }

                        // File controls. We have to show file dialogs after rendering is complete (otherwise the window
                        // freezes) so we only set that 'X has been requested' when these buttons are clicked.
                        if ui.button(1, "Open File...").clicked() {
                            *queued_action = Action::OpenDocument;
                        }

                        if let Some(doc) = state.document.as_mut() {
                            if ui.button(2, "Reload File").clicked() {
                                *queued_action = Action::ReloadDocument;
                            }

                            if doc.can_save() && ui.button(3, "Save").clicked() {
                                *queued_action = Action::SaveDocument;
                            }

                            if ui.button(4, "Save As...").clicked() {
                                *queued_action = Action::SaveDocumentAs;
                            }

                            if let Some(hot_reload_tx) = hot_reload_tx {
                                if ui.button(5, "Play in Project64")
                                    .with_width(200.0)
                                    .clicked()
                                {
                                    if let Ok(data) = doc.bgm.as_bytes() {
                                        let _ = hot_reload_tx.send(data);
                                    } else {
                                        todo!("surface bgm::en error");
                                    }
                                }
                            }
                        }
                    });

                    ui.pad(1, 10.0);

                    if let Some(doc) = state.document.as_mut() {
                        ui.hbox(2, |ui| doc.update(ui));
                    }
                });
            });

            // Re-update if state changed.
            if updates >= 2 && !state.commit() {
                break;
            }
        }

        if let Some(title) = self.state.document.as_ref().map(|doc| {
            doc.path.file_name().map(|s| format!("{} - Mamar", s.to_string_lossy()))
        }).flatten() {
            self.with_window(|w| {
                w.set_title(&title);
            });
        } else {
            self.with_window(|w| {
                w.set_title("Mamar");
            });
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

            // Open
            VirtualKeyCode::O if modifiers.ctrl() => self.queued_action = Action::OpenDocument,

            // Save As
            VirtualKeyCode::S if modifiers.ctrl() && modifiers.shift() => self.queued_action = Action::SaveDocumentAs,

            // Save
            VirtualKeyCode::S if modifiers.ctrl() => self.queued_action = Action::SaveDocument,

            _ => {}
        }
    }

    fn do_queued_action(&mut self) -> Result<bool, Box<dyn Error>> {
        let action = self.queued_action.clone();
        self.queued_action = Action::None;

        match action {
            Action::None => return Ok(false),
            Action::OpenDocument => {
                if let Some(doc) = state::Document::open_prompt()? {
                    self.state.document = Some(doc);
                }
            }
            Action::ReloadDocument => {
                if let Some(doc) = self.state.document.as_ref() {
                    if let Some(reloaded) = state::Document::open_from_path(doc.path.clone())? {
                        self.state.document = Some(reloaded);
                    }
                }
            }
            Action::SaveDocument => {
                if let Some(doc) = &mut self.state.document {
                    if doc.can_save() {
                        doc.save()?;
                    } else {
                        doc.save_as()?;
                    }
                }
            }
            Action::SaveDocumentAs => {
                if let Some(doc) = &mut self.state.document {
                    doc.save_as()?;
                }
            }
        }

        Ok(self.state.commit())
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
        self.with_window(|w| w.set_visible(true));

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

            match self.do_queued_action() {
                Ok(true) => {
                    self.update();
                    self.draw();
                }
                Ok(false) => {}
                Err(error) => {
                    // TODO: surface error in the UI somepalce
                    log::error!("error: {}", error);
                }
            }
        })
    }
}
