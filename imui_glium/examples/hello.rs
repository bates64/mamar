use imui_glium::*;

#[derive(Debug)]
struct Interface {
    num_buttons: u8,
}

impl Interface {
    fn update(&mut self, glue: &mut Glue) {
        loop {
            let mut updated = false;

            glue.update(|ui| {
                for i in 0..self.num_buttons {
                    if ui.button(i, "Hello!") {
                        self.num_buttons += 1;

                        // If state changes during an update, its recommended that you update again afterward so
                        // you always show the latest data.
                        updated = true;
                    }
                }
            });

            if !updated {
                break;
            }
        }

        println!("{:?}", &self);
    }
}

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

    glue.atlas.insert("button", "assets/mamar.png").unwrap();

    let mut interface = Interface { num_buttons: 1 };
    interface.update(&mut glue);

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
                    interface.update(&mut glue);
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
            let mut surface = display.draw();
            surface.clear_color(0.0, 0.0, 0.0, 1.0);
            glue.draw(&mut surface).unwrap();
            surface.finish().unwrap();
        }
    })
}
