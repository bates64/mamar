use std::error::Error;

pub use imui::*;
pub use glium;
pub use glium::Surface;
pub use glium::glutin::event::{Event, WindowEvent};
pub use glium::glutin::event_loop::{EventLoop, ControlFlow};
use glium::{uniform, implement_vertex, Display, VertexBuffer, IndexBuffer, Texture2d};
use glium::program::{Program, ProgramCreationInput};

type Transform3D = euclid::default::Transform3D<f32>;

pub struct Glue {
    ui: Ui,
    buffers_need_writing: bool,

    program: Program,

    vertex_buf: VertexBuffer<Vertex>,
    vertex_vec: Vec<Vertex>,

    index_buf: IndexBuffer<u16>,
    index_vec: Vec<u16>,

    texture: Texture2d,
    projection: Transform3D,
}

#[derive(Clone, Copy)]
struct Vertex {
    position: [f32; 2],
    uv: [f32; 2],
    color: [f32; 4],
}

implement_vertex!(Vertex, position, uv, color);

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
            buffers_need_writing: false, // Nothing in UI yet to be drawn.

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

            vertex_buf: VertexBuffer::empty_dynamic(facade, 1024)?,
            vertex_vec: Vec::with_capacity(1024),

            index_buf: IndexBuffer::empty_dynamic(facade, glium::index::PrimitiveType::TrianglesList, 512)?,
            index_vec: Vec::with_capacity(512),

            texture: {
                use image::GenericImageView;
                use glium::texture::RawImage2d;

                let image = image::load_from_memory(include_bytes!("button.png"))?;
                let data = image.as_rgba8().unwrap();
                let raw = RawImage2d::from_raw_rgba(data.to_vec(), image.dimensions());

                Texture2d::new(facade, raw)?
            },

            projection: screen_to_clip(facade),
        })
    }

    /// Handle glutin input and window resize events. Returns `true` if an `update()` call is recommended.
    #[must_use]
    pub fn handle_window_event(&mut self, event: &WindowEvent, display: &Display) -> bool {
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

                self.buffers_need_writing = true;
                false // Only the layout changed.
            }

            _ => false
        }
    }

    /// Update the UI tree.
    pub fn update<F: FnOnce(&mut UiFrame<'_>)>(&mut self, f: F) {
        self.ui.update(f);
        self.buffers_need_writing = true;
    }

    pub fn needs_redraw(&self) -> bool {
        self.buffers_need_writing
    }

    pub fn draw<S: Surface>(&mut self, surface: &mut S)  -> Result<(), glium::DrawError> {
        let projection: [[f32; 4]; 4] = self.projection.to_arrays();

        if self.buffers_need_writing {
            let vertex_vec = &mut self.vertex_vec;
            let index_vec = &mut self.index_vec;
            let mut vtx_number = 0;

            vertex_vec.clear();
            index_vec.clear();

            let mut render_quad = |rect: &Rect, uv: &Rect, top_left_color, top_right_color, bottom_left_color, bottom_right_color| {
                // Render a quad:
                //
                //    0 -- 1
                //    |  / |
                //    | /  |
                //    2 -- 3
                //
                index_vec.extend_from_slice(&[
                    vtx_number + 0, vtx_number + 1, vtx_number + 2,
                    vtx_number + 2, vtx_number + 1, vtx_number + 3,
                ]);
                vertex_vec.extend_from_slice(&[
                    Vertex {
                        position: [rect.min_x(), rect.min_y()],
                        uv: [uv.min_x(), uv.min_y()],
                        color: top_left_color,
                    },
                    Vertex {
                        position: [rect.max_x(), rect.min_y()],
                        uv: [uv.max_x(), uv.min_y()],
                        color: top_right_color,
                    },
                    Vertex {
                        position: [rect.min_x(), rect.max_y()],
                        uv: [uv.min_x(), uv.max_y()],
                        color: bottom_left_color,
                    },
                    Vertex {
                        position: [rect.max_x(), rect.max_y()],
                        uv: [uv.max_y(), uv.max_y()],
                        color: bottom_right_color,
                    },
                ]);
                vtx_number += 4;
            };

            self.ui.draw_tree(|_key, widget, rect| {
                match widget {
                    Widget::Button {} | Widget::Div => {
                        // TODO: get uv coordinates from atlas struct
                        let uv = Rect {
                            origin: Point::new(0.0, 0.0),
                            size: Size::new(1.0, 1.0),
                        };

                        // TODO: let widget style reference define this
                        let top_left_color = [1.0, 1.0, 1.0, 1.0];
                        let top_right_color = [1.0, 1.0, 1.0, 1.0];
                        let bottom_left_color = [1.0, 1.0, 1.0, 1.0];
                        let bottom_right_color = [1.0, 1.0, 1.0, 1.0];

                        // TODO: nine-slice for button

                        render_quad(rect, &uv, top_left_color, top_right_color, bottom_left_color, bottom_right_color);
                    }
                    _ => todo!()
                }
            });

            // Upload the new data to the GPU.
            //self.vertex_buf.invalidate();
            //self.index_buf.invalidate();
            self.vertex_buf.as_mut_slice().write(vertex_vec);
            self.index_buf.as_mut_slice().write(index_vec);
            self.buffers_need_writing = false;
            println!("uploaded {} triangles", index_vec.len() / 3);
        }

        surface.draw(
            &self.vertex_buf,
            &self.index_buf,//&self.index_buf.slice(0..self.index_vec.len()).unwrap(),
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
