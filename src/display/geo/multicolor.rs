use glium::program::ProgramCreationInput;
use glium::{implement_vertex, uniform};
use lyon::path::path::BuilderWithAttributes as PathBuilder;
use lyon::path::Path;
use lyon::tessellation::{FillVertex, VertexBuffers, *};

use crate::display::draw::Ctx;
use crate::display::Entity;
use crate::util::math::*;

/// Higher values = less triangles.
const PATH_TOLERANCE: f32 = 0.1;

#[derive(Copy, Clone, Debug)]
pub struct Vertex {
    position: [f32; 2],
    color: [f32; 4],
}

implement_vertex!(Vertex, position, color);

impl Vertex {
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
pub struct Multicolor {
    geometry: VertexBuffers<Vertex, u16>,
    aabb: Box3D,
    transform: Transform3D,
}

impl Multicolor {
    pub fn build_svg<F>(build: F) -> Self
    where
        F: FnOnce(&mut PathBuilder) -> Option<Box2D>,
    {
        let mut path = Path::builder_with_attributes(4);
        let aabb = build(&mut path);
        let path = path.build();

        let mut geometry = VertexBuffers::new();
        let mut tessellator = FillTessellator::new();

        tessellator
            .tessellate_path(
                &path,
                &FillOptions::default().with_tolerance(PATH_TOLERANCE),
                &mut BuffersBuilder::new(&mut geometry, Vertex::from_fill),
            )
            .unwrap();

        let aabb = aabb.unwrap_or_else(|| {
            lyon::algorithms::aabb::fast_bounding_rect(path.iter())
                .to_box2d()
                .cast_unit()
        });

        Self {
            geometry,
            aabb: Box3D::new(point3(aabb.min.x, aabb.min.y, 0.0), point3(aabb.max.x, aabb.max.y, 0.0)),
            transform: Default::default(),
        }
    }
}

impl Entity for Multicolor {
    fn draw(&self, ctx: &mut Ctx) {
        let transform = self.transform.to_arrays();

        ctx.draw(
            &self.geometry.vertices,
            &self.geometry.indices,
            ProgramCreationInput::SourceCode {
                vertex_shader: include_str!("multicolor.vert"),
                fragment_shader: include_str!("multicolor.frag"),
                geometry_shader: None,
                tessellation_control_shader: None,
                tessellation_evaluation_shader: None,
                transform_feedback_varyings: None,
                outputs_srgb: true,
                uses_point_size: false,
            },
            &uniform! {
                transform: transform,
            },
            &glium::DrawParameters {
                blend: glium::draw_parameters::Blend::alpha_blending(),
                ..Default::default()
            },
        );
    }

    fn transform(&mut self, transform: &Transform3D) {
        self.transform = self.transform.then(transform);
    }

    fn bounding_box(&self) -> Box3D {
        self.transform.outer_transformed_box3d(&self.aabb).unwrap()
    }
}
