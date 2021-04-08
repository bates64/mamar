use std::error::Error;

use glium::glutin::event::WindowEvent;
use glium::{uniform, implement_vertex, Display, Surface, VertexBuffer, IndexBuffer, Texture2d};
use glium::program::{Program, ProgramCreationInput};

type Transform3D = euclid::default::Transform3D<f32>;

pub use imui::*;

pub struct Glue {
    ui: Ui,
    needs_redraw: bool,

    program: Program,
    vertex_buf: VertexBuffer<Vertex>,
    index_buf: IndexBuffer<u16>,

    texture: Texture2d,
    projection: Transform3D,
}

#[derive(Clone, Copy)]
struct Vertex {
    position: [f32; 2],
    uv: [f32; 2],
}

implement_vertex!(Vertex, position, uv);

/// Calculates a screen-space projection matrix for the given display.
fn screen_to_clip(display: &Display) -> Transform3D {
    let gl_window = display.gl_window();
    let window = gl_window.window();
    let size = window.inner_size().to_logical(window.scale_factor());

    // This orthographic projection converts logical screen-space coords to normalized (-1.0..1.0) coords for GL.
    Transform3D::ortho(0.0, size.width, size.height, 0.0, 1000.0, -1000.0)
}

impl Glue {
    pub fn new(facade: &Display) -> Result<Self, Box<dyn Error>> {
        Ok(Self {
            ui: Ui::new(),
            needs_redraw: true,

            program: Program::new(facade, ProgramCreationInput::SourceCode {
                vertex_shader: include_str!("shader.vert"),
                fragment_shader: include_str!("shader.frag"),
                geometry_shader: None,
                tessellation_control_shader: None,
                tessellation_evaluation_shader: None,
                transform_feedback_varyings: None,
                outputs_srgb: true,
                uses_point_size: false,
            })?,

            vertex_buf: VertexBuffer::new(facade, &[
                Vertex { position: [0.0,   0.0],   uv: [0.0, 0.0] }, // Top left.
                Vertex { position: [0.0,   100.0], uv: [0.0, 1.0] }, // Bottom left.
                Vertex { position: [100.0, 0.0],   uv: [1.0, 0.0] }, // Top right.
                Vertex { position: [100.0, 100.0], uv: [1.0, 1.0] }, // Bottom right.
            ])?,

            index_buf: IndexBuffer::new(facade, glium::index::PrimitiveType::TrianglesList, &[
                0, 1, 2,
                2, 1, 3,
            ])?,

            texture: {
                use image::GenericImageView;
                use glium::texture::RawImage2d;

                let image = image::load_from_memory(include_bytes!("button.png"))?;
                let data = image.as_rgba8().unwrap();
                let raw = RawImage2d::from_raw_rgba(data.to_vec(), image.dimensions());

                Texture2d::new(facade, raw)?
            },

            projection: Transform3D::identity() //screen_to_clip(facade),
        })
    }

    /// Handle glutin input and window resize events.
    pub fn handle_window_event(&mut self, event: &WindowEvent, display: &Display) {
        match event {
            WindowEvent::Resized(size) => {
                let dpi_scale = {
                    let gl_window = display.gl_window();
                    gl_window.window().scale_factor()
                };
                let size = size.to_logical(dpi_scale);

                self.projection = screen_to_clip(display);
                self.ui.resize(Rect {
                    origin: Point::zero(),
                    size: Size::new(size.width, size.height),
                });

                self.needs_redraw = true;
            }

            _ => {}
        }
    }

    /// Update the UI tree.
    pub fn update<F: FnOnce(&mut UiFrame<'_>)>(&mut self, f: F) {
        self.ui.update(f);
        self.needs_redraw = true;
    }

    pub fn needs_redraw(&self) -> bool {
        self.needs_redraw
    }

    pub fn draw<S: Surface>(&mut self, surface: &mut S)  -> Result<(), glium::DrawError> {
        self.needs_redraw = false;

        let projection: [[f32; 4]; 4] = self.projection.to_arrays();

        // TODO self.ui.draw_tree

        surface.draw(
            &self.vertex_buf,
            &self.index_buf,
            &self.program,
            &uniform! {
                tex: &self.texture,
                projection: projection,
            },
            &glium::DrawParameters {
                blend: glium::draw_parameters::Blend::alpha_blending(),
                ..Default::default()
            },
        )
    }
}
