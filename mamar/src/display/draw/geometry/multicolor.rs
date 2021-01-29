use super::*;
use glium::{implement_vertex, uniform, Surface, VertexBuffer, IndexBuffer};
use lyon::tessellation::{VertexBuffers, FillVertex};

pub const VERTEX_SHADER: &str = include_str!("multicolor.vert");
pub const FRAGMENT_SHADER: &str = include_str!("multicolor.frag");

#[derive(Copy, Clone, Debug)]
pub struct Vertex {
    position: [f32; 2],
    color: [f32; 4],
}

implement_vertex!(Vertex, position, color);

impl super::Vertex for Vertex {
    fn from_fill(mut vertex: FillVertex) -> Self {
        let position = vertex.position();
        let rgba = vertex.interpolated_attributes();

        Vertex {
            position: position.to_array(),
            color: [rgba[0], rgba[1], rgba[2], rgba[3]],
        }
    }
}

/// Geometry where each vertex has its own colour.
pub struct Geometry {
    vertex_buf: VertexBuffer<Vertex>,
    index_buf: IndexBuffer<u16>,
    aabb: Box2D<GeomSpace>,
}

impl super::Geometry for Geometry {
    type Vertex = Vertex;

    fn cache<A: Application>(ctx: &mut Ctx<A>) -> &mut LruCache<u64, Rc<Self>> {
        &mut ctx.multicolor_geom_cache
    }

    fn from_lyon<A: Application>(ctx: &Ctx<A>, bufs: &VertexBuffers<Vertex, u16>, aabb: Box2D<GeomSpace>) -> Self {
        Geometry {
            vertex_buf: VertexBuffer::new(&ctx.display, &bufs.vertices).unwrap(),
            index_buf: IndexBuffer::new(&ctx.display, glium::index::PrimitiveType::TrianglesList, &bufs.indices).unwrap(),
            aabb,
        }
    }

    fn draw<A: Application>(&self, ctx: &mut Ctx<A>, transform: [[f32; 4]; 4], params: &glium::DrawParameters) {
        ctx.ensure_frame();
        ctx.frame.as_mut().unwrap().draw(
            &self.vertex_buf,
            &self.index_buf,
            &ctx.multicolor_shader,
            &uniform! {
                matrix: ctx.projection.to_arrays(),
                transform: transform,
            },
            params,
        ).unwrap();
    }

    fn bounding_box(&self) -> &Box2D<GeomSpace> {
        &self.aabb
    }
}
