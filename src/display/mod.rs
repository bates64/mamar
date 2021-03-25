mod draw;
mod entity;
pub mod geo;
mod icon;
mod input;

use std::sync::mpsc::Sender;

pub use entity::{Entity, EntityGroup};
pub use input::Input;
use draw::Ctx;
use glium::glutin::dpi::LogicalSize;
use glium::glutin::event::{Event, WindowEvent};
use glium::glutin::event_loop::{ControlFlow, EventLoop, EventLoopProxy};
use glium::glutin::window::WindowBuilder;
use glium::glutin::ContextBuilder;
use glium::Display;

use crate::util::math::*;

/// A request for the ui thread to do something, from the main thread.
pub enum UiThreadRequest {
    Draw(Input), // Please send me a display list so I can draw it
    OpenSong(String), // Open BGM at given path
}

/// A request for the main thread to do something, from the ui thread.
pub enum MainThreadRequest {
    Draw(Box<dyn Entity>),
}

pub mod init {
    use super::*;

    // Note: causes crashes on weaker GPUs if set too high - modify with caution!
    const MSAA: u16 = 4;

    pub fn create_event_loop() -> (EventLoop<MainThreadRequest>, EventLoopProxy<MainThreadRequest>) {
        let event_loop = EventLoop::with_user_event(); // Owned by the main thread, see main()
        let event_loop_proxy = event_loop.create_proxy(); // For sending messages to the main thread
        (event_loop, event_loop_proxy)
    }

    pub fn main(event_loop: EventLoop<MainThreadRequest>, ui_tx: Sender<UiThreadRequest>) -> ! {
        let wb = WindowBuilder::new()
            .with_title("Mamar")
            .with_inner_size(LogicalSize::new(800.0, 600.0))
            //.with_min_inner_size(LogicalSize::new(800.0, 600.0))
            .with_window_icon(icon::get_icon());
        let cb = ContextBuilder::new().with_multisampling(MSAA).with_srgb(true);
        let display = Display::new(wb, cb, &event_loop).unwrap();
        let mut ctx = Ctx::new(display, ui_tx);
        let mut input_state = Input::default();

        event_loop.run(move |event, _, control_flow| {
            *control_flow = ControlFlow::Wait;

            let mut request_redraw = false;

            // Handle events
            match event {
                Event::WindowEvent { event, .. } => match event {
                    WindowEvent::CloseRequested => {
                        log::debug!("bye");
                        *control_flow = ControlFlow::Exit;
                    }

                    WindowEvent::CursorMoved { position, .. } => {
                        // Convert position to screen-space
                        // FIXME: dpi scale on my laptop is 1.75; why?
                        let dpi_scale = {
                            let gl_window = ctx.display.gl_window();
                            gl_window.window().scale_factor()
                        };
                        let position = position.to_logical(dpi_scale);
                        let position = point(position.x, position.y);

                        // 2D position is trivial
                        input_state.now.mouse_pos = Some(position);

                        // We will do 3D position later, upon recieving MainThreadRequest::Draw
                        // Note: input_state.now.mouse_pos_raycasted is OUTDATED !

                        request_redraw = true;
                    }

                    WindowEvent::CursorLeft { .. } => {
                        input_state.now.mouse_pos = None;
                        input_state.now.mouse_pos_raycasted = None;
                        request_redraw = true;
                    },

                    WindowEvent::MouseInput { state, button, .. } => {
                        use glium::glutin::event::ElementState;

                        match state {
                            ElementState::Pressed => input_state.now.set_mouse_button(button, true),
                            ElementState::Released => input_state.now.set_mouse_button(button, false),
                        }

                        request_redraw = true;
                    }
                    _ => (),
                },

                Event::RedrawRequested(_) => {
                    request_redraw = true;
                }

                // https://github.com/rust-windowing/glutin/issues/1325
                //Event::RedrawEventsCleared => {
                //
                //}
                Event::UserEvent(callback) => {
                    match callback {
                        MainThreadRequest::Draw(mut root) => {
                            // Mouse picking (given a 2D mouse pos, figure out the highest-Z entity that touches it)
                            // TODO: probably move this and raycast_z into input module
                            if let Some(mouse_pos) = &input_state.now.mouse_pos {
                                input_state.now.mouse_pos_raycasted = raycast_z(mouse_pos.clone(), &mut root);
                            }

                            // Actually render it
                            root.draw(&mut ctx);
                            ctx.finish();
                        }
                    }
                }

                _ => (),
            }

            if request_redraw {
                ctx.ui_tx.send(UiThreadRequest::Draw(input_state.clone())).unwrap();
                input_state.next_frame(); // The state was just sent
            }
        })
    }

    fn raycast_z(pos: Point2D, entity: &mut Box<dyn Entity>) -> Option<Point3D> {
        // Convert entity bounding box to 2D
        let bb_3d = entity.bounding_box();
        let bb_2d = Box2D {
            min: bb_3d.min.to_2d(),
            max: bb_3d.max.to_2d(),
        };

        if bb_2d.contains(pos) {
            // Register a hit at the *lowest* z-pos of this entity.
            let mut hit = point3(pos.x, pos.y, bb_3d.min.z);

            if let Some(group) = entity.children() {
                // Recurse over the entity's children and check their bounding-boxes also
                for child in group {
                    if let Some(inner_hit) = raycast_z(pos.clone(), child) {
                        // If we collided with the child, only update `hit` if it is above (in z-pos) the current `hit`.
                        if inner_hit.z > hit.z {
                            hit = inner_hit;
                        }
                    }
                }
            }

            Some(hit)
        } else {
            // No collision
            None
        }
    }
}
