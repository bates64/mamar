mod icon;
pub mod draw;

use std::time::{Instant, Duration};
use glium::glutin;
use glutin::dpi::LogicalSize;
use draw::Ctx;

const MSAA: u16 = 16;
const FPS: f32 = 60.0;

pub trait Application {
    fn draw(&mut self, ctx: &mut Ctx<Self>, delta: f32) where Self: Sized;
}

pub fn main<A: Application + 'static>(mut application: A) -> ! {
    use glutin::event_loop::ControlFlow;
    use glutin::event::{Event, WindowEvent};

    let event_loop = glutin::event_loop::EventLoop::with_user_event();
    let wb = glutin::window::WindowBuilder::new()
        .with_title("Mamar")
        .with_inner_size(LogicalSize::new(800.0, 600.0))
        //.with_min_inner_size(LogicalSize::new(800.0, 600.0))
        .with_window_icon(icon::get_icon());
    let cb = glutin::ContextBuilder::new()
        .with_multisampling(MSAA)
        .with_srgb(true);
    let display = glium::Display::new(wb, cb, &event_loop).unwrap();
    let mut ctx = Ctx::new(display, event_loop.create_proxy());

    let mut prev_frame = Instant::now();

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        // Handle events
        match event {
            Event::WindowEvent { event, .. } => match event {
                WindowEvent::CloseRequested => {
                    println!("bye");
                    *control_flow = ControlFlow::Exit;
                },
                WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => ctx.update_projection(),
                WindowEvent::CursorMoved { position, .. } => {
                    let position = position.to_logical(ctx.dpi_scale() as f64); // Apply DPI
                    ctx.mouse_pos = Some(draw::point(position.x, position.y));
                },
                WindowEvent::CursorLeft { .. } => ctx.mouse_pos = None,
                WindowEvent::MouseInput { state, button, .. } => {
                    // TODO: handle multiple buttons at once (use a vec? bitflags?)
                    ctx.mouse_button = match state {
                        glutin::event::ElementState::Pressed => Some(button),
                        glutin::event::ElementState::Released => None,
                    };
                },
                _ => (),
            },
            //Event::RedrawRequested(_) => (),
            // https://github.com/rust-windowing/glutin/issues/1325
            Event::RedrawEventsCleared => {
                let delta = {
                    let now = Instant::now();
                    let delta = now.duration_since(prev_frame);
                    prev_frame = now;
                    delta.as_secs_f32()
                };

                application.draw(&mut ctx, delta);
                let redraw_requested = ctx.flush();

                if redraw_requested {
                    // Ask the OS to redraw us
                    let gl_window = ctx.display.gl_window();
                    gl_window.window().request_redraw();

                    // Limit frames to FPS so we don't hog the CPU
                    *control_flow = ControlFlow::WaitUntil(Instant::now() + Duration::from_secs_f32(1.0 / FPS));
                }
            },
            Event::UserEvent(callback) => {
                callback(&mut application);
                // Redraw is implicitly requested by OS
            }
            _ => (),
        }
    })
}
