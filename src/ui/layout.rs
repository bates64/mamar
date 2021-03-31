use crate::display::*;
use crate::util::*;

pub struct Row {
    x: f32,
}

impl Row {
    pub fn new() -> Self {
        Self {
            x: 0.0,
        }
    }

    pub fn apply<E: Entity>(&mut self, entity: &mut E) {
        entity.translate(vec3(self.x, 0.0, 0.0));

        self.x += entity.bounding_box().width();
    }

    pub fn pad(&mut self, padding: f32) {
        self.x += padding;
    }
}
