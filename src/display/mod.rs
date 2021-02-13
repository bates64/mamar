mod draw;
mod entity;
pub mod geo;
mod icon;

use std::sync::mpsc::Sender;

pub use entity::{Entity, EntityGroup};
use glium::glutin::dpi::LogicalSize;
use glium::glutin::event::{Event, WindowEvent};
use glium::glutin::event_loop::{ControlFlow, EventLoop, EventLoopProxy};
use glium::glutin::window::WindowBuilder;
use glium::glutin::ContextBuilder;
use glium::Display;

pub type DisplayList = Vec<Box<dyn Entity>>;

pub mod init {
    use super::*;

    // Note: causes crashes on weaker GPUs if set too high - modify with caution!
    const MSAA: u16 = 4;

    /// A request for the ui thread to do something, from the main thread.
    pub enum UiThreadRequest {
        Draw, // Please send me a display list so I can draw it
    }

    /// A request for the main thread to do something, from the ui thread.
    pub enum MainThreadRequest {
        Draw(DisplayList), // Here is your display list
    }

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
        let mut ctx = draw::Ctx::new(display);

        event_loop.run(move |event, _, control_flow| {
            *control_flow = ControlFlow::Wait;

            // Handle events
            match event {
                Event::WindowEvent { event, .. } => match event {
                    WindowEvent::CloseRequested => {
                        log::debug!("bye");
                        *control_flow = ControlFlow::Exit;
                    }
                    // TODO
                    /*
                    WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => ctx.update_projection(),
                    WindowEvent::CursorMoved { position, .. } => {
                        let position = position.to_logical(ctx.dpi_scale() as f64); // Apply DPI
                        ctx.mouse_pos = Some(draw::point(position.x, position.y));
                    }
                    WindowEvent::CursorLeft { .. } => ctx.mouse_pos = None,
                    WindowEvent::MouseInput { state, button, .. } => {
                        // TODO: handle multiple buttons at once (use a vec? bitflags?)
                        ctx.mouse_button = match state {
                            glutin::event::ElementState::Pressed => Some(button),
                            glutin::event::ElementState::Released => None,
                        };
                    }
                    */
                    _ => (),
                },

                Event::RedrawRequested(_) => {
                    ui_tx.send(UiThreadRequest::Draw).unwrap();
                }

                // https://github.com/rust-windowing/glutin/issues/1325
                //Event::RedrawEventsCleared => {
                //
                //}
                Event::UserEvent(callback) => {
                    match callback {
                        MainThreadRequest::Draw(dl) => {
                            for entity in &dl {
                                entity.draw(&mut ctx);
                            }

                            //log::debug!("drew {} entities", dl.len());

                            ctx.finish();
                        }
                    }
                }

                _ => (),
            }
        })
    }
}
