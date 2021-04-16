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
    z: f32,
}

implement_vertex!(Vertex, position, uv, color, z);

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
                }, &mut self.renderer);
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
        self.ui.update(f, &mut self.renderer);
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
                depth: glium::draw_parameters::Depth {
                    test: glium::draw_parameters::DepthTest::IfMoreOrEqual,
                    write: true,
                    ..Default::default()
                },
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

    #[allow(dead_code)]
    fn render_sprite_scaled<I: Into<SpriteId>>(&mut self, region: &Region, sprite_id: I, color: Color) {
        let rect = &region.rect;
        let uv = &self.atlas.get(sprite_id).expect("tried to render unknown sprite").uv_rect;

        let top_left_color = color.clone();
        let top_right_color = color.clone();
        let bottom_left_color = color.clone();
        let bottom_right_color = color;

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
                z: region.layer as f32,
            },
            Vertex {
                position: [rect.max_x(), rect.min_y()],
                uv: [uv.max_x(), uv.min_y()],
                color: top_right_color,
                z: region.layer as f32,
            },
            Vertex {
                position: [rect.min_x(), rect.max_y()],
                uv: [uv.min_x(), uv.max_y()],
                color: bottom_left_color,
                z: region.layer as f32,
            },
            Vertex {
                position: [rect.max_x(), rect.max_y()],
                uv: [uv.max_x(), uv.max_y()],
                color: bottom_right_color,
                z: region.layer as f32,
            },
        ]);
    }

    /// Render a sprite using 9-slice scaling.
    /// This means that the corners of the sprite will stay their source size, with the other segments scaled.
    fn render_sprite_9slice<I: Into<SpriteId>>(&mut self, region: &Region, sprite_id: I, color: Color) {
        let rect = &region.rect;
        let sprite = &self.atlas.get(sprite_id).expect("tried to render unknown sprite");

        let corner_pos = Size::new(
            sprite.src_dimensions.width / 3.0,
            sprite.src_dimensions.height / 3.0,
        );
        let corner_uv = Size::new(
            sprite.uv_rect.width() / 3.0,
            sprite.uv_rect.height() / 3.0,
        );

        //    0 -- 1 -- 2 -- 3
        //    |  / |  / |  / |
        //    | /  | /  | /  |
        //    4 -- 5 -- 6 -- 7
        //    |  / |  / |  / |
        //    | /  | /  | /  |
        //    8 -- 9 -- 10--11
        //    |  / |  / |  / |
        //    | /  | /  | /  |
        //    12-- 13-- 14--15

        let vtx_number = self.vertex_vec.len() as u16;
        self.index_vec.extend_from_slice(&[
            // Top-left corner.
            vtx_number + 0, vtx_number + 1, vtx_number + 4,
            vtx_number + 4, vtx_number + 5, vtx_number + 1,

            // Top scaled segment.
            vtx_number + 1, vtx_number + 2, vtx_number + 5,
            vtx_number + 5, vtx_number + 6, vtx_number + 2,

            // Top-right corner.
            vtx_number + 2, vtx_number + 3, vtx_number + 6,
            vtx_number + 6, vtx_number + 7, vtx_number + 3,

            // Left scaled segment.
            vtx_number + 4, vtx_number + 5, vtx_number + 8,
            vtx_number + 8, vtx_number + 9, vtx_number + 5,

            // Central scaled segment.
            vtx_number + 5, vtx_number + 6, vtx_number + 9,
            vtx_number + 9, vtx_number + 10, vtx_number + 6,

            // Right scaled segment.
            vtx_number + 6, vtx_number + 7, vtx_number + 10,
            vtx_number + 10, vtx_number + 7, vtx_number + 11,

            // Bottom-left corner.
            vtx_number + 8, vtx_number + 9, vtx_number + 12,
            vtx_number + 12, vtx_number + 9, vtx_number + 13,

            // Bottom scaled segment.
            vtx_number + 9, vtx_number + 10, vtx_number + 13,
            vtx_number + 13, vtx_number + 14, vtx_number + 10,

            // Bottom-right corner.
            vtx_number + 10, vtx_number + 11, vtx_number + 14,
            vtx_number + 14, vtx_number + 15, vtx_number + 11,
        ]);
        self.vertex_vec.extend_from_slice(&[
            // 0
            Vertex {
                position: [rect.min_x(), rect.min_y()],
                uv: [sprite.uv_rect.min_x(), sprite.uv_rect.min_y()],
                color: color.clone(),
                z: region.layer as f32,
            },
            // 1
            Vertex {
                position: [rect.min_x() + corner_pos.width, rect.min_y()],
                uv: [sprite.uv_rect.min_x() + corner_uv.width, sprite.uv_rect.min_y()],
                color: color.clone(),
                z: region.layer as f32,
            },
            // 2
            Vertex {
                position: [rect.max_x() - corner_pos.width, rect.min_y()],
                uv: [sprite.uv_rect.max_x() - corner_uv.width, sprite.uv_rect.min_y()],
                color: color.clone(),
                z: region.layer as f32,
            },
            // 3
            Vertex {
                position: [rect.max_x(), rect.min_y()],
                uv: [sprite.uv_rect.max_x(), sprite.uv_rect.min_y()],
                color: color.clone(),
                z: region.layer as f32,
            },

            // 4
            Vertex {
                position: [rect.min_x(), rect.min_y() + corner_pos.height],
                uv: [sprite.uv_rect.min_x(), sprite.uv_rect.min_y() + corner_uv.height],
                color: color.clone(),
                z: region.layer as f32,
            },
            // 5
            Vertex {
                position: [rect.min_x() + corner_pos.width, rect.min_y() + corner_pos.height],
                uv: [sprite.uv_rect.min_x() + corner_uv.width, sprite.uv_rect.min_y() + corner_uv.height],
                color: color.clone(),
                z: region.layer as f32,
            },
            // 6
            Vertex {
                position: [rect.max_x() - corner_pos.width, rect.min_y() + corner_pos.height],
                uv: [sprite.uv_rect.max_x() - corner_uv.width, sprite.uv_rect.min_y() + corner_uv.height],
                color: color.clone(),
                z: region.layer as f32,
            },
            // 7
            Vertex {
                position: [rect.max_x(), rect.min_y() + corner_pos.height],
                uv: [sprite.uv_rect.max_x(), sprite.uv_rect.min_y() + corner_uv.height],
                color: color.clone(),
                z: region.layer as f32,
            },

            // 8
            Vertex {
                position: [rect.min_x(), rect.max_y() - corner_pos.height],
                uv: [sprite.uv_rect.min_x(), sprite.uv_rect.max_y() - corner_uv.height],
                color: color.clone(),
                z: region.layer as f32,
            },
            // 9
            Vertex {
                position: [rect.min_x() + corner_pos.width, rect.max_y() - corner_pos.height],
                uv: [sprite.uv_rect.min_x() + corner_uv.width, sprite.uv_rect.max_y() - corner_uv.height],
                color: color.clone(),
                z: region.layer as f32,
            },
            // 10
            Vertex {
                position: [rect.max_x() - corner_pos.width, rect.max_y() - corner_pos.height],
                uv: [sprite.uv_rect.max_x() - corner_uv.width, sprite.uv_rect.max_y() - corner_uv.height],
                color: color.clone(),
                z: region.layer as f32,
            },
            // 11
            Vertex {
                position: [rect.max_x(), rect.max_y() - corner_pos.height],
                uv: [sprite.uv_rect.max_x(), sprite.uv_rect.max_y() - corner_uv.height],
                color: color.clone(),
                z: region.layer as f32,
            },

            // 12
            Vertex {
                position: [rect.min_x(), rect.max_y()],
                uv: [sprite.uv_rect.min_x(), sprite.uv_rect.max_y()],
                color: color.clone(),
                z: region.layer as f32,
            },
            // 13
            Vertex {
                position: [rect.min_x() + corner_pos.width, rect.max_y()],
                uv: [sprite.uv_rect.min_x() + corner_uv.width, sprite.uv_rect.max_y()],
                color: color.clone(),
                z: region.layer as f32,
            },
            // 14
            Vertex {
                position: [rect.max_x() - corner_pos.width, rect.max_y()],
                uv: [sprite.uv_rect.max_x() - corner_uv.width, sprite.uv_rect.max_y()],
                color: color.clone(),
                z: region.layer as f32,
            },
            // 15
            Vertex {
                position: [rect.max_x(), rect.max_y()],
                uv: [sprite.uv_rect.max_x(), sprite.uv_rect.max_y()],
                color: color.clone(),
                z: region.layer as f32,
            },
        ]);
    }
}

impl Render for Renderer {
    fn measure_text(&mut self, text: &str) -> Size {
        let size = 14.0 * self.dpi;

        if let Some(face) = &mut self.face {
            let mut dimensions = Size::zero();

            face.layout(&mut self.atlas, None, &font::TextStyle::new(text, size, 0), |_, rect| {
                if rect.max_x() > dimensions.width {
                    dimensions.width = rect.max_x();
                }

                if rect.max_y() > dimensions.height {
                    dimensions.height = rect.max_y();
                }
            });

            Size::new(dimensions.width / self.dpi, dimensions.height / self.dpi)
        } else {
            Size::zero()
        }
    }

    fn render_text(&mut self, region: &Region, text: &str) {
        let color = [1.0, 1.0, 1.0, 1.0];

        // Text layouting and rendering happens in physical coordinates (DPI-unaware), so account for that.
        let size = 14.0 * self.dpi;
        let offset = Point::new(region.rect.origin.x, region.rect.origin.y);
        let layout_rect = Rect {
            origin: Point::zero(), // For some reason we have to apply `offset` later or layouting goes haywire...
            size: Size::new(
                region.rect.size.width * self.dpi + 16.0, // FIXME remove this +16
                region.rect.size.height * self.dpi,
            ),
        };
        let dpi = self.dpi;

        if let Some(face) = &mut self.face {
            let vtx = &mut self.vertex_vec;
            let idx = &mut self.index_vec;

            face.layout(&mut self.atlas, Some(&layout_rect), &font::TextStyle::new(text, size, 0), |s, rect| {
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
                        z: region.layer as f32,
                    },
                    Vertex {
                        position: [offset.x + rect.max_x() / dpi, offset.y + rect.min_y() / dpi],
                        uv: [uv.max_x(), uv.min_y()],
                        color: color.clone(),
                        z: region.layer as f32,
                    },
                    Vertex {
                        position: [offset.x + rect.min_x() / dpi, offset.y + rect.max_y() / dpi],
                        uv: [uv.min_x(), uv.max_y()],
                        color: color.clone(),
                        z: region.layer as f32,
                    },
                    Vertex {
                        position: [offset.x + rect.max_x() / dpi, offset.y + rect.max_y() / dpi],
                        uv: [uv.max_x(), uv.max_y()],
                        color: color.clone(),
                        z: region.layer as f32,
                    },
                ]);
            });
        }
    }

    fn render_button(&mut self, region: &Region, texture: &'static str) {
        self.render_sprite_9slice(region, texture, [1.0, 1.0, 1.0, 1.0]);
    }

    fn render_toggle_button(&mut self, region: &Region, is_pressed: bool, is_enabled: bool) {
        let sprite = match (is_pressed, is_enabled) {
            (true, true) => "toggle_button_on_pressed",
            (true, false) => "toggle_button_off_pressed",
            (false, true) => "toggle_button_on",
            (false, false) => "toggle_button_off",
        };

        self.render_sprite_9slice(region, sprite, [1.0, 1.0, 1.0, 1.0]);
    }

    fn render_window(&mut self, region: &Region) {
        self.render_sprite_9slice(region, "window", [1.0, 1.0, 1.0, 1.0]);
    }
}
