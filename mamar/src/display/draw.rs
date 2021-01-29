pub mod color;
pub mod geometry;
pub mod entity;
mod math;

pub use math::*;
pub use color::Color;
pub use entity::Entity;
use geometry::{Geometry, Vertex};

use async_std::prelude::*;
use async_std::task;

use glium::{Surface, Display, Frame, Program};
use glium::glutin::dpi::LogicalSize;
type EventLoopProxy<A> = glium::glutin::event_loop::EventLoopProxy<Box<dyn FnOnce(&mut A) + Send>>;
pub use glium::glutin::event::MouseButton;

use lyon::path::Path;
use lyon::tessellation::*;
pub use lyon::path::path::BuilderWithAttributes as PathBuilder;

use std::rc::Rc;
use std::panic::Location;
use std::hash::Hash;
use lru::LruCache;

use super::Application;

/// Higher values = less triangles.
/// Automatically divided by the DPI.
const PATH_TOLERANCE: f32 = 0.1;

/// The number of geometries of a particular type that can be cached before least-recently-used entries are removed.
const GEOMETRY_CACHE_LIMIT: usize = 128;

/*
#[derive(Copy, Clone)]
struct TextureVertex {
    position: [f32; 2],
    uv: [f32; 2],
}

implement_vertex!(TextureVertex, position, uv);
*/

pub fn lerp(current: f32, target: f32, factor: f32) -> f32 {
    let t = match factor {
        t if t < 0.0 => 0.0,
        t if t > 1.0 => 1.0,
        t => t,
    };

    current * (1.0 - t) + target * t
}

pub struct Ctx<A: Application + 'static> {
    pub(super) display: Display,
    frame: Option<Frame>,
    event_loop_proxy: EventLoopProxy<A>,

    projection: Transform3D<ScreenSpace, ClipSpace>,

    redraw_requested: bool,

    // XXX: these would be better encapsulated in geometry::multicolor if possible
    multicolor_shader: Program,
    multicolor_geom_cache: LruCache<u64, Rc<geometry::multicolor::Geometry>>,

    //texture_shader: Program,

    pub mouse_pos: Option<Point2D<ScreenSpace>>, // Mouse pos; None if not onscreen
    pub mouse_button: Option<MouseButton>, // Current frame
    pub mouse_button_previous: Option<MouseButton>, // Previous frame
}

impl<A: Application + 'static> Ctx<A> {
    pub(super) fn new(display: Display, event_loop_proxy: EventLoopProxy<A>) -> Self {
        Ctx {
            multicolor_shader: Program::from_source(
                &display,
                geometry::multicolor::VERTEX_SHADER,
                geometry::multicolor::FRAGMENT_SHADER,
                None,
            ).unwrap(),
            multicolor_geom_cache: LruCache::new(GEOMETRY_CACHE_LIMIT),
            //texture_shader: compile_shader!(&display, "texture"),

            projection: screen_to_clip(&display),

            redraw_requested: false,

            display,
            frame: None,
            event_loop_proxy,

            mouse_pos: None,
            mouse_button: None,
            mouse_button_previous: None,
        }
    }

    /// Flushes what has been drawn to the screen.
    /// If this returns `true`, the application is requesting that it is drawn again.
    pub(super) fn flush(&mut self) -> bool {
        if let Some(frame) = &mut self.frame {
            frame.set_finish().unwrap();
        }
        self.frame = None;

        self.mouse_button_previous = self.mouse_button;
        self.mouse_button = None;

        let redraw_requested = self.redraw_requested;
        self.redraw_requested = false;
        redraw_requested
    }

    fn ensure_frame(&mut self) {
        if self.frame.is_none() {
            let mut frame = self.display.draw();
            frame.clear_all((0.0, 0.0, 0.0, 1.0), 0.0, 0);
            self.frame = Some(frame);
        }
    }

    /// Grabs the logical (DPI-aware) size of the display, i.e. the bounds for our drawing coordinate space.
    // TODO: compare with frame.get_dimensions() - is it DPI-aware?
    pub fn display_size(&self) -> Size2D<ScreenSpace> {
        let gl_window = self.display.gl_window();
        let window = gl_window.window();
        let size: LogicalSize<f32> = window.inner_size().to_logical(window.scale_factor());
        Size2D::new(size.width, size.height)
    }

    pub fn dpi_scale(&self) -> f32 {
        let gl_window = self.display.gl_window();
        let window = gl_window.window();
        window.scale_factor() as f32
    }

    /// Call this when the display size or DPI changes.
    pub(super) fn update_projection(&mut self) {
        self.projection = screen_to_clip(&self.display);
    }

    /// Requests that a redraw occurs next frame, for animations.
    /// Calling this multiple times within a single frame does nothing.
    pub fn request_redraw(&mut self) {
        /*
        let gl_window = self.display.gl_window();
        let window = gl_window.window();
        window.request_redraw();
        */
        self.redraw_requested = true;
    }

    /// Spawns a future, then redraws when it completes.
    pub fn spawn<F, C>(&mut self, future: F)
    where
        F: Future<Output = C> + Send + 'static,
        C: FnOnce(&mut A) + Send + 'static,
    {
        struct SyncEventLoopProxy<A: Application + 'static>(EventLoopProxy<A>);

        // XXX: swap this out for something safer in the future
        // Here we're telling Rust that glutin's EventLoopProxy is Send so we can pass it over threads.
        // EventLoopProxy internally contains a raw pointer (!) to the system event loop, so it is !Send.
        // This is definitely a Really Bad idea and could probably be done better with channels or something,
        // but it /does/ work (on Windows, at least). [TODO: test this doesn't explode on macOS and Linux!]
        // (We need an event loop proxy so we can ask for a redraw at an arbitrary future time.)
        unsafe impl<A: Application + 'static> Send for SyncEventLoopProxy<A> {}

        let sync_proxy = SyncEventLoopProxy(self.event_loop_proxy.clone());
        task::spawn(async move {
            // Run the future to completion
            let callback: Box<dyn FnOnce(&mut A) + Send> = Box::new(future.await);

            // Send an empty event::UserEvent to the event loop managing this Ctx (display.rs).
            // This implicitly triggers a redraw from the OS.
            if sync_proxy.0.send_event(callback).is_err() {
                // Note: we can't print the error because `callback` does not impl Debug
                panic!("event loop died");
            }
        });
    }

    // TODO: spawn() but that only allows k instances at once (use #[track_caller] hashmap)

    /// Builds a mesh ready to be drawn from a path of lines and beizer curves.
    ///
    /// Caching is automatic - a path will not be rebuilt unless the `memo` arguments change or it is expelled from the
    /// least-recently-used cache. The values of `memo`  are passed to the `build` callback and can be used to move
    /// values into the closure. This is similar to the API of the `useMemo` hook in React.
    #[track_caller] // required for Location::caller()
    pub fn fill_path<F, M, G>(&mut self, memo: M, build: F) -> Entity<G>
    where
        F: FnOnce(&mut PathBuilder, M) -> Option<Box2D<GeomSpace>> + 'static, // requires that anything entering via the stack comes through M
        M: Hash,
        G: Geometry + 'static,
    {
        let hash: u64 = {
            use std::hash::Hasher;
            use std::collections::hash_map::DefaultHasher;

            let mut hasher = DefaultHasher::new();
            Location::caller().hash(&mut hasher); // unique compile-time id for this caller
            memo.hash(&mut hasher); // args to the path build fn
            hasher.finish()
        };

        // Load from cache
        if let Some(cached) = G::cache(self).get(&hash) {
            return Entity::new(cached.clone());
        }

        // At this point, we could expel any previously-cached geometries that came from this caller.
        // We don't really need to do this, and it could be useful to *not* do this for paths that change between
        // a few specific M states (e.g. short CPU-based animations, or boolean states).

        let mut path = Path::builder_with_attributes(4);
        let bounding_box = build(&mut path, memo);
        let path = path.build();

        let mut geometry: VertexBuffers<G::Vertex, u16> = VertexBuffers::new();
        let mut tessellator = FillTessellator::new();

        tessellator.tessellate_path(
            &path,
            &FillOptions::default().with_tolerance(PATH_TOLERANCE / self.dpi_scale()),
            &mut BuffersBuilder::new(&mut geometry, G::Vertex::from_fill),
        ).unwrap();

        let geometry = Rc::new(G::from_lyon(
            self,
            &geometry,
            bounding_box
                .unwrap_or_else(|| lyon::algorithms::aabb::fast_bounding_rect(path.iter()).to_box2d().cast_unit())
        ));

        // Store to cache
        G::cache(self).put(hash, geometry.clone());

        Entity::new(geometry)
    }

    /*
    // TODO: caching!! and also return a Mesh
    pub fn texture_path<F>(&mut self, png_bytes: &[u8], build: F) -> TextureGeometry<'_>
        where F: FnOnce(&mut PathBuilder, (u32, u32))
    {
        use glium::texture::RawImage2d;

        let image = image::load(Cursor::new(png_bytes), image::ImageFormat::Png).unwrap().to_rgba16();
        let dimensions = image.dimensions();

        let image = RawImage2d::from_raw_rgba(image.into_raw(), dimensions);
        let texture = Texture2d::new(&self.display, image).unwrap();

        let path = {
            let mut builder = Path::builder_with_attributes(2);
            build(&mut builder, dimensions);
            builder.build()
        };

        let mut geometry: VertexBuffers<TextureVertex, u16> = VertexBuffers::new();
        let mut tessellator = FillTessellator::new();

        tessellator.tessellate_path(
            &path,
            &FillOptions::default().with_tolerance(PATH_TOLERANCE / self.dpi_scale()),
            &mut BuffersBuilder::new(&mut geometry, |mut vertex: FillVertex| {
                let position = vertex.position();
                let uv = vertex.interpolated_attributes();

                TextureVertex {
                    position: position.to_array(),
                    uv: [uv[0], uv[1]],
                }
            }),
        ).unwrap();

        TextureGeometry {
            ctx: self,
            geometry,
            transform: Transform::new(),
            texture,
        }
    }
    */
}

// TODO: move this and related structs to an entity.rs

/*
// TODO: remove, implement Geometry instead
#[must_use = "use `.draw()` method to draw"]
pub struct TextureGeometry<'a> {
    ctx: &'a mut Ctx,
    geometry: VertexBuffers<TextureVertex, u16>,
    texture: Texture2d,
    transform: Transform,
}

impl<'a> TextureGeometry<'a> {
    pub fn translate(mut self, x: f32, y: f32) -> Self {
        self.transform = self.transform.translate(x, y);
        self
    }

    pub fn rotate<R: Into<Rad<f32>>>(mut self, rad: R) -> Self {
        self.transform = self.transform.rotate(rad);
        self
    }

    pub fn scale(mut self, x_factor: f32, y_factor: f32) -> Self {
        self.transform = self.transform.scale(x_factor, y_factor);
        self
    }

    pub fn draw(self) {
        let matrix: [[f32; 4]; 4] = self.ctx.projection.into();
        let transform: [[f32; 4]; 4] = self.transform.matrix.into();
        let uniforms = uniform! {
            matrix: matrix,
            transform: transform,
            tex: &self.texture,
        };

        let vertex_buffer = VertexBuffer::new(&self.ctx.display, &self.geometry.vertices).unwrap();
        let indices = IndexBuffer::new(&self.ctx.display, glium::index::PrimitiveType::TrianglesList, &self.geometry.indices).unwrap();

        self.ctx.ensure_frame();
        self.ctx.frame.as_mut().unwrap().draw(
            &vertex_buffer,
            &indices,
            &self.ctx.texture_shader,
            &uniforms,
            &glium::DrawParameters {
                blend: glium::draw_parameters::Blend::alpha_blending(),
                ..Default::default()
            },
        ).unwrap();
    }
}
*/
