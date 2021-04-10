use std::ops::RangeInclusive;

use super::*;

#[derive(Debug, PartialEq)]
pub struct Layout {
    pub position: Position,
    pub width: RangeInclusive<f32>,
    pub height: RangeInclusive<f32>,

    /// The direction in which to lay out children.
    pub direction: Dir,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Dir {
    /// Left-to-right.
    Row,

    /// Top-to-bottom.
    Column,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Position {
    Absolute(Point),
    Relative(Point),
}

impl Default for Layout {
    fn default() -> Self {
        Self {
            position: Position::Relative(Point::new(0.0, 0.0)),
            direction: Dir::Row, // TEMP
            width: 0.0..=f32::INFINITY,
            height: 0.0..=f32::INFINITY,
        }
    }
}

fn clamp(value: f32, range: &RangeInclusive<f32>) -> f32 {
    if value < *range.start() {
        *range.start()
    } else if value > *range.end() {
        *range.end()
    } else {
        value
    }
}

impl Position {
    pub fn resolve(&self, parent: &Point) -> Point {
        match &self {
            Position::Absolute(point) => point.clone(),
            Position::Relative(Point { x, y, .. }) => Point::new(parent.x + *x, parent.y + *y),
        }
    }
}

pub(crate) fn compute(pool: &mut Pool, key: &Key, rect: Rect) {
    let control = pool.get_mut(key).unwrap();

    let rect = Rect {
        // TODO: option to centre
        origin: control.layout.position.resolve(&rect.origin),
        size: Size::new(
            clamp(rect.size.width, &control.layout.width),
            clamp(rect.size.height, &control.layout.height),
        ),
    };

    control.region = Region {
        rect: rect.clone(),
        layer: LAYER_DEFAULT,
    };

    let children = control.children.clone();
    match children.len() {
        0 => {}
        1 => {
            // Single child gets all the space its parent has.
            compute(pool, &children[0], rect);
        }
        _ => match control.layout.direction {
            Dir::Row => {
                let mut pos = Vector::zero();
                let mut row_height = 0.0;

                for child in &children {
                    compute(
                        pool,
                        child,
                        Rect {
                            origin: Point::new(rect.min_x() + pos.x, rect.min_y() + pos.y),
                            size: Size::new(rect.width() - pos.x, rect.height() - pos.y),
                        },
                    );

                    let calc = &pool[child].region.rect;
                    pos.x += calc.width();
                    if calc.height() > row_height {
                        row_height = calc.height();
                    }

                    // Wrap.
                    // TODO: relayout prev child if it is too wide (gt, not eq)
                    if pos.x >= rect.width() {
                        pos.x = 0.0;
                        pos.y += row_height;
                        row_height = 0.0;
                    }
                }
            }
            Dir::Column => todo!("column layout")
        }
    }
}
