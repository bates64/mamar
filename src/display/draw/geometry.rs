pub mod multicolor;

use std::rc::Rc;

use lru::LruCache;
use lyon::tessellation::VertexBuffers;

use super::math::*;
use super::Ctx;

/// Something that can be drawn to the screen.
pub trait Geometry: Sized {
    type Vertex: Vertex;

    fn cache(ctx: &mut Ctx) -> &mut LruCache<u64, Rc<Self>>;

    fn from_lyon(ctx: &Ctx, bufs: &VertexBuffers<Self::Vertex, u16>, aabb: Box2D)
        -> Self;
    fn draw(&self, ctx: &mut Ctx, transform: [[f32; 4]; 4], params: &glium::DrawParameters); // XXX: should be Transform3D
    fn bounding_box(&self) -> &Box3D;
}

pub trait Vertex {
    fn from_fill(vertex: lyon::tessellation::FillVertex) -> Self;
}
