use std::cmp::Ordering;

use crate::display::draw::Ctx;
use crate::util::*;

/// An Entity is some mesh that can be transformed and drawn.
pub trait Entity: Send + Sync {
    /// Commit the entity to the screen, drawing over previously-drawn entities.
    fn draw(&mut self, ctx: &mut Ctx);

    /// Applies some transformation to this entity.
    fn transform(&mut self, transform: &Transform3D);

    /// Calculates the bounding box of this entity **including transformations**.
    fn bounding_box(&self) -> Box3D;

    /// Moves the entity by a particular vector.
    fn translate(&mut self, vec: Vector3D) {
        self.transform(&vec.to_transform());
    }

    /// Rotates this entity on the z-axis (yaw). Use `rad(t)` for radians, and `deg(t)` for degrees.
    /// This is typically what you will always want in 2D, since the z axis faces the camera.
    fn rotate_2d(&mut self, angle: Angle) {
        self.transform(&Transform3D::rotation(0.0, 0.0, 1.0, angle));
    }

    /// Scales this entity up (positive) or down (negative) by a factor.
    fn scale(&mut self, x: f32, y: f32, z: f32) {
        self.transform(&Transform3D::scale(x, y, z));
    }

    /// Performs a scale in the x and y axes.
    fn scale_2d(&mut self, x: f32, y: f32) {
        self.scale(x, y, 1.0);
    }

    /// Performs a uniform scale in all axes.
    fn scale_uniform(&mut self, factor: f32) {
        self.scale(factor, factor, factor);
    }

    /// Sets the pivot of this entity to a particular point, such that `anchor(point3(0.5, 0.5, 0.5))` causes
    /// further transformations to apply around the centre of the entity.
    ///
    /// By default, entities pivot around their top-left. Note that anchoring twice won't reset the previous anchoring!
    fn anchor(&mut self, point: Point3D) {
        let bounds = self.bounding_box();
        self.translate(vec3(
            bounds.width() * -point.x,
            bounds.height() * -point.y,
            bounds.depth() * -point.z,
        ));
    }

    fn children(&self) -> Option<&Vec<Box<dyn Entity>>> {
        None
    }

    /*
    /// Returns `true` if the mouse is hovering over this entity in its current position.
    ///
    /// Note: this uses `self.bounding_box`, which is axis-aligned, so rotation may produce unexpectedly
    /// large input surfaces.
    ///
    /// XXX: doesn't take into account entities closer to the camera than this one.
    fn is_mouse_over(&self, ctx: &Ctx) -> bool {
        if let Some(mouse_pos) = ctx.mouse_pos {
            let aabb = self.bounding_box();

            // Convert our 3D bounding-box to a 2D one, discarding (!) the Z value.
            let aabb = Box2D::new(
                aabb.min.xy(),
                aabb.max.xy(),
            );

            aabb.contains(mouse_pos)
        } else {
            // Mouse is offscreen
            false
        }
    }

    /// Returns `true` if this entity is being clicked this frame.
    fn is_click(&self, ctx: &Ctx, button: MouseButton) -> bool {
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
    */
}

impl PartialEq for dyn Entity {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other) == Ordering::Equal
    }
}

impl Eq for dyn Entity {}

impl PartialOrd for dyn Entity {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Defines the drawing/raycasting order for entities, based on their maximal z position.
impl Ord for dyn Entity {
    fn cmp(&self, other: &Self) -> Ordering {
        let self_z = self.bounding_box().max.z as isize;
        let other_z = other.bounding_box().max.z as isize;

        other_z.cmp(&self_z)
    }
}

/// A bunch of entities grouped together, so they can be transformed and drawn as one.
#[derive(Default)]
pub struct EntityGroup {
    children: Vec<Box<dyn Entity>>,
}

impl EntityGroup {
    pub fn new() -> Self {
        Default::default()
    }

    pub fn with_capacity(capacity: usize) -> Self {
        Self { children: Vec::with_capacity(capacity) }
    }

    pub fn add<E: Entity + 'static>(&mut self, child: E) {
        self.children.push(Box::new(child));
    }
}

impl Entity for EntityGroup {
    fn draw(&mut self, ctx: &mut Ctx) {
        self.children.par_sort_unstable();
        for child in &mut self.children {
            child.draw(ctx);
        }
    }

    fn transform(&mut self, transform: &Transform3D) {
        for child in &mut self.children {
            child.transform(transform)
        }
    }

    fn bounding_box(&self) -> Box3D {
        let mut aabb = Box3D::zero();

        for child in &self.children {
            aabb = aabb.union(&child.bounding_box());
        }

        aabb
    }

    fn children(&self) -> Option<&Vec<Box<dyn Entity>>> {
        Some(&self.children)
    }
}

impl From<Vec<Box<dyn Entity>>> for EntityGroup {
    fn from(children: Vec<Box<dyn Entity>>) -> Self {
        Self { children }
    }
}
