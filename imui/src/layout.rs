use std::ops::RangeInclusive;

use super::{Pool, Key};

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
    Absolute(f32, f32),
    Relative(f32, f32),
}

#[derive(Debug, PartialEq, Clone)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

impl Default for Layout {
    fn default() -> Self {
        Self {
            position: Position::Relative(0.0, 0.0),
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
    pub fn resolve_x(&self, parent_x: f32) -> f32 {
        match &self {
            Position::Absolute(x, _) => *x,
            Position::Relative(x, _) => parent_x + *x,
        }
    }

    pub fn resolve_y(&self, parent_y: f32) -> f32 {
        match &self {
            Position::Absolute(_, y) => *y,
            Position::Relative(_, y) => parent_y + *y,
        }
    }
}

pub(crate) fn compute(pool: &mut Pool, key: &Key, rect: Rect) {
    let control = pool.get_mut(key).unwrap();

    let rect = Rect {
        // TODO: option to centre
        x: control.layout.position.resolve_x(rect.x),
        y: control.layout.position.resolve_y(rect.y),
        w: clamp(rect.w, &control.layout.width),
        h: clamp(rect.h, &control.layout.height),
    };

    control.calculated_rect = Some(rect.clone());

    let children = control.children.clone();
    match children.len() {
        0 => {}
        1 => {
            // Single child gets all the space its parent has.
            compute(pool, &children[0], rect);
        }
        _ => match control.layout.direction {
            Dir::Row => {
                let mut x = 0.0;
                let mut y = 0.0;
                let mut row_height = 0.0;

                for child in &children {
                    compute(
                        pool,
                        child,
                        Rect {
                            x: rect.x + x,
                            y: rect.y + y,
                            w: rect.w - x,
                            h: rect.h - y,
                        },
                    );

                    let calc = pool[child].calculated_rect.as_ref().unwrap();
                    x += calc.w;
                    if calc.h > row_height {
                        row_height = calc.h;
                    }

                    // Wrap.
                    if x >= rect.w {
                        x = 0.0;
                        y += row_height;
                        row_height = 0.0;
                    }
                }
            }
            Dir::Column => todo!("column layout")
        }
    }
}
