use glium::index::PrimitiveType;
use glium::program::{Program, ProgramCreationInput};
use glium::uniforms::Uniforms;
use glium::{Display, DrawParameters, Frame, IndexBuffer, Surface, Vertex, VertexBuffer};

pub struct Ctx {
    pub display: Display,
    frame: Frame,
    /* refcell caches */

    /*
    event_loop_proxy: EventLoopProxy<Ui>,

    projection: Transform3D,

    redraw_requested: bool,

    // XXX: these would be better encapsulated in geometry::multicolor if possible
    multicolor_shader: Program,
    multicolor_geom_cache: LruCache<u64, Rc<geometry::multicolor::Geometry>>,

    //texture_shader: Program,
    pub mouse_pos: Option<Point2D>, // Mouse pos; None if not onscreen
    pub mouse_button: Option<MouseButton>,       // Current frame
    pub mouse_button_previous: Option<MouseButton>, // Previous frame
    */
}

impl Ctx {
    pub fn new(display: Display) -> Self {
        Self {
            frame: {
                let mut frame = display.draw();
                frame.clear_all((0.0, 1.0, 0.0, 1.0), 0.0, 0);
                frame
            },
            display,
        }
    }

    pub fn finish(&mut self) {
        self.frame.set_finish().unwrap();

        self.frame = self.display.draw();
        self.frame.clear_all((1.0, 0.0, 0.0, 1.0), 0.0, 0);
    }

    pub fn draw<U, V>(
        &mut self,
        vertices: &[V],
        indices: &[u16],
        program: ProgramCreationInput,
        uniforms: &U,
        params: &DrawParameters,
    ) where
        U: Uniforms,
        V: Vertex,
    {
        // TODO: cache geometry and program

        let vertex_buf = VertexBuffer::new(&self.display, vertices).unwrap();
        let index_buf = IndexBuffer::new(&self.display, PrimitiveType::TrianglesList, indices).unwrap();

        let program = Program::new(&self.display, program).unwrap();

        self.frame
            .draw(&vertex_buf, &index_buf, &program, uniforms, params)
            .unwrap();
    }
}

impl Drop for Ctx {
    fn drop(&mut self) {
        let _ = self.frame.set_finish();
    }
}

/*
impl Ctx {
    pub(super) fn new(display: Display, event_loop_proxy: EventLoopProxy<Ui>) -> Self {
        Ctx {
            multicolor_shader: geometry::multicolor::compile_shader(&display),
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
            frame.clear_all((0.0, 0.0, 0.0, 0.0), 0.0, 0);
            self.frame = Some(frame);
        }
    }

    pub fn set_window_title(&self, title: &str) {
        let gl_window = self.display.gl_window();
        let window = gl_window.window();
        window.set_title(title);
    }

    /// Grabs the logical (DPI-aware) size of the display, i.e. the bounds for our drawing coordinate space.
    // TODO: compare with frame.get_dimensions() - is it DPI-aware?
    pub fn display_size(&self) -> Size2D {
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

    /// Spawns a function in a thread, then redraws when it completes. The function must return a callback function
    /// which will be executed on the host thread with a mutable Ui reference, in order to update its state.
    // TODO: much better to use a futures executor and channels or something. or like an actions list that is iterated
    // through between frames
    pub fn spawn<F, C>(&mut self, future: F)
    where
        F: FnOnce() -> C + Send + 'static,
        C: FnOnce(&mut Ui) + Send + 'static,
    {
        struct SyncEventLoopProxy(EventLoopProxy<Ui>);

        // XXX: swap this out for something safer in the future
        // Here we're telling Rust that glutin's EventLoopProxy is Send so we can pass it over threads.
        // EventLoopProxy internally contains a raw pointer (!) to the system event loop, so it is !Send.
        // This is definitely a Really Bad idea and could probably be done better with channels or something,
        // but it /does/ work (on Windows, at least). [TODO: test this doesn't explode on macOS and Linux!]
        // (We need an event loop proxy so we can ask for a redraw at an arbitrary future time.)
        unsafe impl Send for SyncEventLoopProxy {}

        let sync_proxy = SyncEventLoopProxy(self.event_loop_proxy.clone());
        std::thread::spawn(move || {
            // Run the future to completion
            let callback: Box<dyn FnOnce(&mut Ui) + Send> = Box::new(future());

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
    pub fn fill_path<F, M, G>(&mut self, memo: M, build: F) -> GeometryEntity<G>
    where
        F: FnOnce(&mut PathBuilder, M) -> Option<Box2D> + 'static, /* requires that anything entering via
                                                                               * the stack comes through M */
        M: Hash,
        G: Geometry + 'static,
    {
        let hash: u64 = {
            use std::collections::hash_map::DefaultHasher;
            use std::hash::Hasher;

            let mut hasher = DefaultHasher::new();
            Location::caller().hash(&mut hasher); // unique compile-time id for this caller
            memo.hash(&mut hasher); // args to the path build fn
            hasher.finish()
        };

        // Load from cache
        if let Some(cached) = G::cache(self).get(&hash) {
            return GeometryEntity::new(cached.clone());
        }

        // At this point, we could expel any previously-cached geometries that came from this caller.
        // We don't really need to do this, and it could be useful to *not* do this for paths that change between
        // a few specific M states (e.g. short CPU-based animations, or boolean states).

        let mut path = Path::builder_with_attributes(4);
        let bounding_box = build(&mut path, memo);
        let path = path.build();

        let mut geometry: VertexBuffers<G::Vertex, u16> = VertexBuffers::new();
        let mut tessellator = FillTessellator::new();

        tessellator
            .tessellate_path(
                &path,
                &FillOptions::default().with_tolerance(PATH_TOLERANCE / self.dpi_scale()),
                &mut BuffersBuilder::new(&mut geometry, G::Vertex::from_fill),
            )
            .unwrap();

        let geometry = Rc::new(G::from_lyon(
            self,
            &geometry,
            bounding_box.unwrap_or_else(|| {
                lyon::algorithms::aabb::fast_bounding_rect(path.iter())
                    .to_box2d()
                    .cast_unit()
            }),
        ));

        // Store to cache
        G::cache(self).put(hash, geometry.clone());

        GeometryEntity::new(geometry)
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
*/
