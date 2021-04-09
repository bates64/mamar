use imui_glium::Glue;
use glium::Surface;
use glium::glutin::event_loop::ControlFlow;
use glium::glutin::event::{Event, WindowEvent};

fn main() {
    let event_loop = glium::glutin::event_loop::EventLoop::new();

    let wb = glium::glutin::window::WindowBuilder::new()
        .with_title("imui_glium")
        .with_inner_size(glium::glutin::dpi::LogicalSize::new(800.0, 600.0));
    let cb = glium::glutin::ContextBuilder::new()
        .with_multisampling(4)
        .with_srgb(true);
    let display = glium::Display::new(wb, cb, &event_loop).unwrap();

    let mut glue = Glue::new(&display).unwrap();

    glue.update(|ui| {
        ui.div(0, |ui| {
            ui.set_size(100.0, 32.0);
        });

        ui.div(1, |ui| {
            ui.set_size(200.0, 64.0);
        });
    });

    {
        let mut surface = display.draw();
        surface.clear_color(0.0, 0.0, 0.0, 1.0);
        glue.draw(&mut surface).unwrap();
        surface.finish().unwrap();
    }

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        let mut redraw = false;

        match event {
            Event::WindowEvent { event, window_id: _ } => {
                glue.handle_window_event(&event, &display);

                if let WindowEvent::CloseRequested = event {
                    *control_flow = ControlFlow::Exit;
                }
            }
            Event::RedrawRequested(_window_id) => {
                redraw = true;
            }
            _ => {}
        }

        if glue.needs_redraw() || redraw {
            let mut surface = display.draw();
            surface.clear_color(0.0, 0.0, 0.0, 1.0);
            glue.draw(&mut surface).unwrap();
            surface.finish().unwrap();
        }
    })
}
