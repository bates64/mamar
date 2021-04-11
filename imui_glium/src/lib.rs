pub mod atlas;
pub mod font;

use std::error::Error;

pub use imui::*;
pub use glium;
pub use glium::Surface;
pub use glium::glutin::event::{Event, WindowEvent};
pub use glium::glutin::event_loop::{EventLoop, ControlFlow};
use glium::{Display, IndexBuffer, VertexBuffer, implement_vertex, uniform};
use glium::program::{Program, ProgramCreationInput};
use glium::backend::Facade;

use atlas::{TextureAtlas, SpriteId};

const INITIAL_VERTEX_BUF_CAPACITY: usize = 512;
const INITIAL_INDEX_BUF_CAPACITY: usize = INITIAL_VERTEX_BUF_CAPACITY * 3 / 4;

type Transform3D = euclid::default::Transform3D<f32>;

/// RGBA colour.
type Color = [f32; 4];

pub struct Glue {
    ui: Ui,
    need_render: bool,

    program: Program,
    vertex_buf: VertexBuffer<Vertex>,
    index_buf: IndexBuffer<u16>,
    projection: Transform3D,

    renderer: Renderer,
}

#[derive(Clone, Copy)]
struct Vertex {
    position: [f32; 2],
    uv: [f32; 2],
    color: [f32; 4],
}

implement_vertex!(Vertex, position, uv, color);

struct Renderer {
    pub vertex_vec: Vec<Vertex>,
    pub index_vec: Vec<u16>,
    pub atlas: TextureAtlas,
    pub face: Option<font::Face>,
    pub dpi: f32,
}

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
            need_render: false, // Nothing in UI yet to be drawn.

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

            vertex_buf: VertexBuffer::empty_dynamic(facade, INITIAL_VERTEX_BUF_CAPACITY)?,
            index_buf: IndexBuffer::empty_dynamic(facade, glium::index::PrimitiveType::TrianglesList, INITIAL_INDEX_BUF_CAPACITY)?,
            projection: screen_to_clip(facade),

            renderer: Renderer {
                vertex_vec: Vec::with_capacity(INITIAL_VERTEX_BUF_CAPACITY),
                index_vec: Vec::with_capacity(INITIAL_INDEX_BUF_CAPACITY),
                atlas: TextureAtlas::new(facade)?,
                face: None,
                dpi: {
                    let gl_window = facade.gl_window();
                    gl_window.window().scale_factor() as f32
                },
            }
        })
    }

    /// Handle glutin input and window resize events. Returns `true` if an `update()` call is recommended.
    #[must_use = "if true is returned, call update"]
    pub fn handle_window_event(&mut self, event: &WindowEvent, display: &Display) -> bool {
        use glium::glutin::event::*;

        let dpi_scale = || {
            let gl_window = display.gl_window();
            gl_window.window().scale_factor()
        };

        match event {
            WindowEvent::Resized(size) => {
                let dpi = dpi_scale();
                let size = size.to_logical(dpi);

                self.projection = screen_to_clip(display);
                self.ui.resize(Rect {
                    origin: Point::zero(),
                    size: Size::new(size.width, size.height),
                });
                self.renderer.dpi = dpi as f32;

                self.need_render = true;
                false // Only the layout changed, which imui handles internally.
            }

            WindowEvent::CursorMoved { position, .. } => {
                let position = position.to_logical(dpi_scale());
                self.ui.set_mouse_pos(Point::new(position.x, position.y))
            }

            WindowEvent::CursorLeft { .. } => self.ui.set_mouse_pos(Point::new(-1000.0, -1000.0)),

            WindowEvent::MouseInput { state, button, .. } => {
                match (state, button) {
                    // TODO right, middle
                    (ElementState::Pressed, MouseButton::Left) => self.ui.set_left_mouse(true),
                    (ElementState::Pressed, MouseButton::Right) => false,
                    (ElementState::Pressed, MouseButton::Middle) => false,
                    (ElementState::Released, MouseButton::Left) => self.ui.set_left_mouse(false),
                    (ElementState::Released, MouseButton::Right) => false,
                    (ElementState::Released, MouseButton::Middle) => false,
                    (_, MouseButton::Other(_)) => false
                }
            }

            _ => false
        }
    }

    /// Update the UI tree.
    pub fn update<F: FnOnce(&mut UiFrame<'_>)>(&mut self, f: F) {
        self.ui.update(f);
        self.need_render = true;
    }

    pub fn needs_redraw(&self) -> bool {
        self.need_render
    }

    pub fn atlas(&mut self) -> &mut TextureAtlas {
        &mut self.renderer.atlas
    }

    pub fn load_font(&mut self, font_bytes: &[u8]) -> Result<(), &'static str> {
        self.renderer.face = Some(font::Face::load(font_bytes)?);
        Ok(())
    }

    pub fn draw<S: Surface, F: Facade>(&mut self, surface: &mut S, facade: &F)  -> Result<(), Box<dyn Error>> {
        let projection: [[f32; 4]; 4] = self.projection.to_arrays();

        if self.need_render {
            self.renderer.clear();
            self.ui.render(&mut self.renderer);

            if !self.renderer.index_vec.is_empty() {
                // Increase buffer sizes to fit the vectors if required.
                if self.renderer.vertex_vec.capacity() > (self.vertex_buf.get_size() / std::mem::size_of::<Vertex>()) {
                    self.vertex_buf = VertexBuffer::empty_dynamic(
                        facade,
                        self.renderer.vertex_vec.capacity(),
                    )?;
                }
                if self.renderer.index_vec.capacity() > (self.index_buf.get_size() / std::mem::size_of::<u16>()) {
                    self.index_buf = IndexBuffer::empty_dynamic(
                        facade,
                        glium::index::PrimitiveType::TrianglesList,
                        self.renderer.index_vec.capacity(),
                    )?;
                }

                // Upload the new data to the GPU.
                self.vertex_buf.as_mut_slice().write(&self.renderer.vertex_vec);
                self.index_buf.as_mut_slice().write(&self.renderer.index_vec);
            }

            self.need_render = false;
        }

        surface.draw(
            &self.vertex_buf,
            &self.index_buf.slice(0..self.renderer.index_vec.len()).unwrap(),
            &self.program,
            &uniform! {
                tex: self.renderer.atlas.texture(),
                projection: projection,
            },
            &glium::DrawParameters {
                blend: glium::draw_parameters::Blend::alpha_blending(),
                ..Default::default()
            },
        )?;

        Ok(())
    }
}

impl Renderer {
    pub fn clear(&mut self) {
        self.index_vec.clear();
        self.vertex_vec.clear();
    }

    fn render_sprite_scaled<I: Into<SpriteId>>(&mut self, region: &Region, sprite_id: I, color: Color) {
        let rect = &region.rect;
        let uv = &self.atlas.get(sprite_id).expect("tried to render unknown sprite").uv_rect;

        let top_left_color = color.clone();
        let top_right_color = color.clone();
        let bottom_left_color = color.clone();
        let bottom_right_color = color;

        // TODO: handle layer

        //
        //    0 -- 1
        //    |  / |
        //    | /  |
        //    2 -- 3
        //
        let vtx_number = self.vertex_vec.len() as u16;
        self.index_vec.extend_from_slice(&[
            vtx_number + 0, vtx_number + 1, vtx_number + 2,
            vtx_number + 1, vtx_number + 3, vtx_number + 2,
        ]);
        self.vertex_vec.extend_from_slice(&[
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
                uv: [uv.max_x(), uv.max_y()],
                color: bottom_right_color,
            },
        ]);
    }
}

impl Render for Renderer {
    fn render_text(&mut self, region: &Region, text: &str) {
        let color = [1.0, 1.0, 1.0, 1.0];

        // Text layouting and rendering happens in physical coordinates (DPI-unaware), so account for that.
        let size = 14.0 * self.dpi;
        let offset = Point::new(region.rect.origin.x, region.rect.origin.y);
        let layout_rect = Rect {
            origin: Point::zero(), // For some reason we have to apply `offset` later or layouting goes haywire...
            size: Size::new(region.rect.size.width * self.dpi, region.rect.size.height * self.dpi),
        };
        let dpi = self.dpi;

        if let Some(face) = &mut self.face {
            let vtx = &mut self.vertex_vec;
            let idx = &mut self.index_vec;

            face.layout(&mut self.atlas, &layout_rect, &font::TextStyle::new(text, size, 0), |s, rect| {
                let uv = &s.uv_rect;

                // TODO: region.layer

                let vtx_number = vtx.len() as u16;
                idx.extend_from_slice(&[
                    vtx_number + 0, vtx_number + 1, vtx_number + 2,
                    vtx_number + 1, vtx_number + 3, vtx_number + 2,
                ]);
                vtx.extend_from_slice(&[
                    Vertex {
                        position: [offset.x + rect.min_x() / dpi, offset.y + rect.min_y() / dpi],
                        uv: [uv.min_x(), uv.min_y()],
                        color: color.clone(),
                    },
                    Vertex {
                        position: [offset.x + rect.max_x() / dpi, offset.y + rect.min_y() / dpi],
                        uv: [uv.max_x(), uv.min_y()],
                        color: color.clone(),
                    },
                    Vertex {
                        position: [offset.x + rect.min_x() / dpi, offset.y + rect.max_y() / dpi],
                        uv: [uv.min_x(), uv.max_y()],
                        color: color.clone(),
                    },
                    Vertex {
                        position: [offset.x + rect.max_x() / dpi, offset.y + rect.max_y() / dpi],
                        uv: [uv.max_x(), uv.max_y()],
                        color: color.clone(),
                    },
                ]);
            });
        }
    }

    fn render_button(&mut self, region: &Region, is_pressed: bool) {
        let sprite;

        if is_pressed {
            sprite = "button_pressed";
        } else {
            sprite = "button";
        }

        self.render_sprite_scaled(region, sprite, [1.0, 1.0, 1.0, 1.0]);
    }
}
