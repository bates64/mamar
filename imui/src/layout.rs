use std::ops::RangeInclusive;

use super::*;

#[derive(Debug, Clone, PartialEq)]
pub struct Layout {
    pub position: Position,
    pub width: Dimension,
    pub height: Dimension,

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
pub enum Dimension {
    Fill, // FIXME
    Range(RangeInclusive<f32>)
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
            width: Dimension::Range(0.0..=f32::INFINITY),
            height: Dimension::Range(0.0..=f32::INFINITY),
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

pub(crate) fn compute<R: Render>(pool: &mut Pool, key: &Key, space_rect: Rect, renderer: &mut R, mut layer: Layer) {
    let control = pool.get(key).unwrap();
    let num_siblings = key.parent // not actually num siblings, because it includes self
        .as_ref()
        .map(|k| pool.get(k).map(|ctrl| ctrl.children.len()))
        .flatten()
        .unwrap_or(1);
    let parent_rect = key.parent
        .as_ref()
        .map(|k| pool.get(k).map(|ctrl| ctrl.region.rect))
        .flatten()
        .unwrap_or(space_rect);

    if control.layout.new_layer {
        layer += 1;
    }

    let mut recommendation = match &control.widget {
        Widget::Text(text) => renderer.measure_text(text),
        _ => space_rect.size,
    };

    if recommendation.width > space_rect.width() {
        recommendation.width = space_rect.width();
    }

    if recommendation.height > space_rect.height() {
        recommendation.height = space_rect.height();
    }

    let mut rect = Rect {
        origin: control.layout.position.resolve(&space_rect.origin),
        size: Size::new(
            control.layout.width.resolve(recommendation.width, parent_rect.width(), num_siblings),
            control.layout.height.resolve(recommendation.height, parent_rect.height(), num_siblings),
        ),
    };

    let children = control.children.clone();
    match children.len() {
        0 => {}
        1 => {
            // Single child gets all the space its parent has.
            compute(pool, &children[0], rect, renderer, layer);

            let calc = &pool[&children[0]].region.rect;
            let control = pool.get(key).unwrap();
            rect.size = Size::new(
                control.layout.width.resolve(calc.width(), parent_rect.width(), num_siblings),
                control.layout.height.resolve(calc.height(), parent_rect.height(), num_siblings),
            );
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
                    let mut looped_already = false;

                    loop {
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
                            break;
                        }

                        let calc = &pool[child].region.rect;
                        pos.x += calc.width();
                        if calc.height() > row_height {
                            row_height = calc.height();
                        }

                        if wrap && !looped_already {
                            if pos.x >= rect.width() && calc.width() < rect.width() {
                                pos.x = 0.0;
                                pos.y += row_height;
                                row_height = 0.0;

                                looped_already = true; // Avoid infinite loop
                                continue; // Relayout the child on the next row
                            }
                        }

                        break;
                    }
                }

                let control = pool.get(key).unwrap();
                rect.size.height = control.layout.height.resolve(
                    pos.y + row_height,
                    parent_rect.height(),
                    num_siblings,
                );
            }
            Dir::TopBottom { mut wrap } => {
                let mut pos = Vector::zero();
                let mut col_width = 0.0;


                for child in &children {
                    loop {
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
                            break;
                        }

                        let calc = &pool[child].region.rect;
                        pos.y += calc.height();
                        if calc.width() > col_width {
                            col_width = calc.width();
                        }

                        if wrap {
                            if pos.x >= rect.width() {
                                pos.x += col_width;
                                pos.y = 0.0;
                                col_width = 0.0;

                                wrap = false; // Avoid infinite loop
                                continue;
                            }
                        }

                        break;
                    }
                }

                let control = pool.get(key).unwrap();
                rect.size.width = control.layout.width.resolve(
                    pos.x + col_width,
                    parent_rect.width(),
                    num_siblings,
                );
            }
        }
    }

    let control = pool.get_mut(key).unwrap();

    control.region = Region {
        rect,
        layer,
    };
}

impl Dimension {
    fn resolve(&self, recommendation: f32, parent_size: f32, num_siblings: usize) -> f32 {
        match self {
            Dimension::Range(range) => clamp(recommendation, range),
            Dimension::Fill => parent_size / num_siblings as f32,
        }
    }
}
