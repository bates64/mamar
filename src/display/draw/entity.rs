use std::rc::Rc;

use super::super::Application;
use super::geometry::Geometry;
use super::math::*;
use super::{Ctx, MouseButton};

/// A `Geometry` supporting transformations in view-space.
/// Cloning is cheap (using reference-counting).
#[must_use = "possibly forgot to call `.draw(ctx)` method"]
#[derive(Clone, PartialEq)]
pub struct Entity<G: Geometry> {
    geometry: Rc<G>,
    transform: Transform3D<GeomSpace, ViewSpace>,
}

impl<G: Geometry> Entity<G> {
    pub fn new(geometry: Rc<G>) -> Self {
        Entity {
            geometry,
            transform: Default::default(), // No transformation
        }
    }

    /// 2D translation
    pub fn translate(mut self, vec: Vector2D<ViewSpace>) -> Self {
        self.transform = self.transform.then_translate(vec.to_3d());
        self
    }

    pub fn anchor(self, x_ndc: f32, y_ndc: f32) -> Self {
        let bounds = self.bounding_box().expect("unable to calculate bounding box");
        self.translate(vec2(bounds.width() * -x_ndc, bounds.height() * -y_ndc))
    }

    /// 2D rotation
    pub fn rotate(mut self, angle: Angle) -> Self {
        self.transform = self.transform.then_rotate(0.0, 0.0, 1.0, angle);
        self
    }

    /// Uniform scale in all axes
    pub fn scale(mut self, factor: f32) -> Self {
        self.transform = self.transform.then_scale(factor, factor, factor);
        self
    }

    pub fn scale_2d(mut self, x: f32, y: f32) -> Self {
        self.transform = self.transform.then_scale(x, y, 1.0);
        self
    }

    /// Calculates the bounding box of this entity, taking into account any transformations.
    pub fn bounding_box(&self) -> Option<Box2D<ViewSpace>> {
        self.transform.outer_transformed_box2d(self.geometry.bounding_box())
    }

    /// Note: this uses `self.bounding_box`, which is axis-aligned, so rotation may produce unexpectedly
    /// large input surfaces.
    pub fn is_mouse_over<A: Application>(&self, ctx: &Ctx<A>) -> bool {
        if let Some(mouse_pos) = ctx.mouse_pos {
            let aabb_view = self.bounding_box().unwrap();

            // TODO: have ctx (or some kind of viewport arg) transform the box from ViewSpace to ScreenSpace
            let aabb_screen = aabb_view.cast_unit();

            aabb_screen.contains(mouse_pos)
        } else {
            // Mouse is offscreen
            false
        }
    }

    pub fn is_click<A: Application>(&self, ctx: &Ctx<A>, button: MouseButton) -> bool {
        // TODO, see below notes
        /*
        1. have some way for an entity to ask the ctx to consider it a mouse region (possibly limited to hover, click, mousedown etc to reduce redraws)
        expose this as .is_mouse_over(ctx) -> bool, .is_click(ctx) -> bool, etc. these can do registering and bounds checking

        2. each render, ctx remembers all the mouse regions *as they are drawn* in an ordered vec; this will be sorted by z (because render order)

        3. upon mouse input, bounding-box test the currently-shown frame's input regions in z order

        4. if there is a hit, redraw with ctx knowing that it is that region id which is hovered/clicked (and no others)

        (could be architectured to allow a ctx to decide it doesnt want to handle a click that is has been given, at which point step 3.. can be done again with the same event [blocklisting the click that already said no]. no need to do this tho i dont think)

        would also be nice to have .is_mouse_over_ignore_z() that bypasses this whole system and just queries the current mouse position
        */

        self.is_mouse_over(ctx) && ctx.mouse_button == Some(button) && ctx.mouse_button_previous.is_none()
    }

    /// Commit the entity to the screen, drawing over previously-drawn entities
    pub fn draw<A: Application>(&self, ctx: &mut Ctx<A>) {
        self.geometry.draw(
            ctx,
            self.transform.to_arrays(),
            &glium::DrawParameters {
                blend: glium::draw_parameters::Blend::alpha_blending(),
                ..Default::default()
            },
        );
    }

    pub fn draw_debug_outlined<A: Application>(&self, ctx: &mut Ctx<A>) {
        self.geometry.draw(
            ctx,
            self.transform.to_arrays(),
            &glium::DrawParameters {
                blend: glium::draw_parameters::Blend::alpha_blending(),
                polygon_mode: glium::draw_parameters::PolygonMode::Line,
                ..Default::default()
            },
        );
    }
}
