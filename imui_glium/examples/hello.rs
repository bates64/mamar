use imui_glium::*;

fn main() {
    let event_loop = EventLoop::new();

    let wb = imui_glium::glium::glutin::window::WindowBuilder::new()
        .with_title("imui_glium")
        .with_inner_size(imui_glium::glium::glutin::dpi::LogicalSize::new(800.0, 600.0));
    let cb = imui_glium::glium::glutin::ContextBuilder::new()
        .with_multisampling(4)
        .with_srgb(true);
    let display = glium::Display::new(wb, cb, &event_loop).unwrap();

    let mut glue = Glue::new(&display).unwrap();

    // Initial interface.
    update_interface(&mut glue);

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
                if glue.handle_window_event(&event, &display) {
                    // Some input happened, update the interface.
                    update_interface(&mut glue);
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

        if glue.needs_redraw() || redraw {
            println!("draw");
            let mut surface = display.draw();
            surface.clear_color(0.0, 0.0, 0.0, 1.0);
            glue.draw(&mut surface).unwrap();
            surface.finish().unwrap();
        }
    })
}

fn update_interface(glue: &mut Glue) {
    println!("update");

    glue.update(|ui| {
        ui.div(0, |ui| {
            if ui.is_mouse_over() {
                ui.set_size(200.0, 128.0);
            } else {
                ui.set_size(100.0, 32.0);
            }
        });

        ui.div(1, |ui| {
            ui.set_size(200.0, 64.0);
        });
    });
}
