use std::ops::RangeInclusive;

use super::*;

#[derive(Debug, PartialEq)]
pub struct Layout {
    pub position: Position,
    pub width: RangeInclusive<f32>,
    pub height: RangeInclusive<f32>,

    /// The direction in which to lay out children.
    pub direction: Dir,

    pub center_x: bool,
    pub center_y: bool,

    pub new_layer: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Dir {
    /// No layout, later children are placed over the top of previous ones.
    BackFront,

    /// Horizontal direction.
    LeftRight { wrap: bool },

    /// Vertical direction.
    TopBottom { wrap: bool },
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
            direction: Dir::BackFront,
            width: 0.0..=f32::INFINITY,
            height: 0.0..=f32::INFINITY,
            center_x: false,
            center_y: false,
            new_layer: false,
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

pub(crate) fn compute<R: Render>(pool: &mut Pool, key: &Key, parent_rect: Rect, renderer: &mut R, mut layer: Layer) {
    let control = pool.get(key).unwrap();

    if control.layout.new_layer {
        layer += 1;
    }

    let mut recommendation = match &control.widget {
        Widget::Text(text) => renderer.measure_text(text),
        _ => parent_rect.size,
    };

    if recommendation.width > parent_rect.width() {
        recommendation.width = parent_rect.width();
    }

    if recommendation.height > parent_rect.height() {
        recommendation.height = parent_rect.height();
    }

    let width_range = control.layout.width.clone();
    let height_range = control.layout.height.clone();

    let mut rect = Rect {
        origin: control.layout.position.resolve(&parent_rect.origin),
        size: Size::new(
            clamp(recommendation.width, &width_range),
            clamp(recommendation.height, &height_range),
        ),
    };

    let children = control.children.clone();
    match children.len() {
        0 => {}
        1 => {
            // Single child gets all the space its parent has.
            compute(pool, &children[0], rect, renderer, layer);

            let calc = &pool[&children[0]].region.rect;
            rect.size.width = clamp(calc.height(), &width_range);
            rect.size.height = clamp(calc.width(), &height_range);
        }
        _ => match control.layout.direction {
            Dir::BackFront => {
                for child in &children {
                    compute(pool, child, rect.clone(), renderer, layer);
                }
            }
            Dir::LeftRight { wrap } => {
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
                        renderer,
                        layer,
                    );

                    // Absolutely-positioned children don't take up space in their parent.
                    if let Position::Absolute(..) = &pool[child].layout.position {
                        continue;
                    }

                    let calc = &pool[child].region.rect;
                    pos.x += calc.width();
                    if calc.height() > row_height {
                        row_height = calc.height();
                    }

                    if wrap {
                        // TODO: relayout prev child if it is too wide (gt, not eq)
                        if pos.x >= rect.width() {
                            pos.x = 0.0;
                            pos.y += row_height;
                            row_height = 0.0;
                        }
                    }
                }

                rect.size.height = clamp(pos.y + row_height, &height_range);
            }
            Dir::TopBottom { wrap } => {
                let mut pos = Vector::zero();
                let mut col_width = 0.0;

                for child in &children {
                    compute(
                        pool,
                        child,
                        Rect {
                            origin: Point::new(rect.min_x() + pos.x, rect.min_y() + pos.y),
                            size: Size::new(rect.width() - pos.x, rect.height() - pos.y),
                        },
                        renderer,
                        layer,
                    );

                    // Absolutely-positioned children don't take up space in their parent.
                    if let Position::Absolute(..) = &pool[child].layout.position {
                        continue;
                    }

                    let calc = &pool[child].region.rect;
                    pos.y += calc.height();
                    if calc.width() > col_width {
                        col_width = calc.width();
                    }

                    if wrap {
                        // TODO: relayout prev child if it is too wide (gt, not eq)
                        if pos.x >= rect.width() {
                            pos.x += col_width;
                            pos.y = 0.0;
                            col_width = 0.0;
                        }
                    }
                }

                rect.size.width = clamp(pos.x + col_width, &width_range);
            }
        }
    }

    let control = pool.get_mut(key).unwrap();

    control.region = Region {
        rect,
        layer,
    };
}
