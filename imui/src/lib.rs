mod layout;

use std::time::{Duration, Instant};
use std::collections::BTreeMap;

use layout::Dir;
pub use layout::Layout;

pub type Point = euclid::default::Point2D<f32>;
pub type Rect = euclid::default::Rect<f32>;
pub type Size = euclid::default::Size2D<f32>;
pub type Vector = euclid::default::Vector2D<f32>;

type Pool = std::collections::HashMap<Key, Control>;

/// Lower values appear below higher values. Can be considered a Z position.
pub type Layer = u8;
pub const LAYER_DEFAULT: Layer = 255;

/// A UI tree.
pub struct Ui {
    /// Control pool/arena. Holds the control tree in a flat format.
    pool: Pool,

    /// Current frame number, increases by 1 each frame.
    frame_no: u8,

    /// The current parent control. References the root node if at the top of the tree.
    parent: Key,

    /// The previous sibling control.
    prev_sibling: Option<Key>, // TODO: consider next_child_index

    /// The display dimensions.
    screen: Rect,

    /// The time at which the previous update occurred.
    most_recent_update: Instant,

    /// Controls that care about whether the mouse intersects them, indexed by layer.
    cares_about_mouse_intersect: BTreeMap<Layer, Vec<Key>>,
}

/// Interface for adding controls to the UI tree.
pub struct UiFrame<'ui> {
    ui: &'ui mut Ui,
    pub delta_time: Duration,
}

type UserKey = u8;

/// A key that uniquely identifies a control.
#[derive(Debug, PartialEq, Eq, Hash, Clone)]
pub struct Key {
    /// User-provided ID, uniquely identifies control between its *possible* siblings. The actual value doesn't matter.
    user: UserKey,

    /// Key of parent(s). This means you don't have to worry about creating _globally_ unique `user` values, and allows
    /// traversing up the tree.
    parent: Option<Box<Key>>,
}

/// Absolutely-positioned region on-screen, used for input and layout.
pub struct Region {
    pub rect: Rect,
    pub layer: Layer,
}

struct Control {
    /// Unique identifier for this control; also allows access to parent.
    key: Key,

    widget: Option<Widget>,

    /// The frame number this control was most recently touched on.
    /// After each update, we can garbage-collect all the controls with `updated_frame_no`s not equal to `Ui::frame_no`.
    updated_frame_no: u8,

    /// This control's children, if any.
    children: Vec<Key>,

    /// If true, rendering of this control and its children will be skipped.
    is_visible: bool,

    /// Layout style of self and children.
    layout: Layout,

    /// The rectangle of space this control takes up, calculated via layout parameters.
    calculated_region: Region,

    /// Whether this control intersects the mouse on this layer. `false` could also mean 'unknown' if this is the first
    /// frame where this control has asked to be added to `Ui::cares_about_mouse_intersect`.
    is_mouse_intersecting: bool,
}

pub enum Widget {
    Div, // TODO: color

    Text(String),

    Button {
    },
}

impl Ui {
    pub fn new() -> Self {
        let mut ui = Self {
            pool: Pool::with_capacity(1),
            cares_about_mouse_intersect: BTreeMap::new(),
            frame_no: 0,
            parent: Key::root(),
            prev_sibling: None,
            screen: Rect {
                origin: Point::new(0.0, 0.0),
                size: Size::new(800.0, 600.0),
            },
            most_recent_update: Instant::now(),
        };

        // Create omnipresent root node.
        ui.pool.insert(Key::root(), Control {
            key: Key::root(),
            widget: None,
            is_visible: true,
            updated_frame_no: ui.frame_no,
            children: Vec::new(),
            layout: Layout::default(),
            calculated_region: Region {
                rect: ui.screen.clone(),
                layer: 0,
            },
            is_mouse_intersecting: false,
        });

        ui
    }

    /// Re-create the tree.
    pub fn update<F: FnOnce(&mut UiFrame<'_>)>(&mut self, f: F) {
        self.begin_frame();

        let now = Instant::now();
        let delta_time = {
            let delta = now.duration_since(self.most_recent_update);
            self.most_recent_update = now;
            delta
        };

        f(&mut UiFrame {
            ui: self,
            delta_time,
        });

        self.end_frame();
    }

    /// Returns the number of controls, besides the root, in the tree.
    pub fn len(&self) -> usize {
        self.pool.len() - 1
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn resize(&mut self, screen: Rect) {
        self.screen = screen;
        layout::compute(&mut self.pool, &Key::root(), self.screen.clone());
    }

    #[must_use = "if true is returned, call update"]
    pub fn set_mouse_pos(&mut self, pos: Point) -> bool {
        let mut hit = false;
        let mut did_change = false;

        // Iterate over the controls that care about mouse intersection, highest layer first.
        for (layer, keys) in self.cares_about_mouse_intersect.iter().rev() {
            for key in keys {
                let control = self.pool.get_mut(key).unwrap();

                if !hit && control.calculated_region.rect.contains(pos) {
                    if !control.is_mouse_intersecting {
                        // Notify the control that it
                        control.is_mouse_intersecting = true;
                        did_change = true;
                    }

                    hit = true; // This control 'owns' the mouse.
                } else if control.is_mouse_intersecting {
                    // Notify the control that it isn't intersecting the mouse anymore.
                    control.is_mouse_intersecting = false;
                    did_change = true;
                }
            }
        }

        // a) No controls that contain pos care, so there's no need to update.
        // b) If any changes were made to control state, we need to update.
        // c) If we hit control(s) but they already knew they were being hit, there is no need to update.
        did_change
    }

    /// Iterate through a tree and its children, depth-first.
    /// (Depth-first is good for drawing - it ensures parents do not overwrite their children when on the same layer.)
    pub fn iter_depth_first_visible<D: FnMut(&Key, &Widget, &Region)>(&self, key: &Key, f: &mut D) {
        let control = self.pool.get(key).unwrap();

        if control.is_visible {
            for child in &control.children {
                self.iter_depth_first_visible(child, f);
            }

            if let Some(widget) = &control.widget {
                f(&control.key, widget, &control.calculated_region);
            }
        }
    }

    fn begin_frame(&mut self) {
        self.frame_no = self.frame_no.wrapping_add(1);

        // Touch the root so it isn't removed by end_frame() later.
        self.pool.get_mut(&Key::root()).unwrap().updated_frame_no = self.frame_no;

        self.cares_about_mouse_intersect.clear();

        self.parent = Key::root();
        self.prev_sibling = None;
    }

    fn end_frame(&mut self) {
        assert!(self.parent == Key::root(), "begin/end mismatch");

        // Garbage collection: remove old (untouched during update) controls.
        let frame_no = self.frame_no;
        self.forget_old_children(&Key::root());
        self.pool.retain(|_, control| !control.is_old(frame_no));

        layout::compute(&mut self.pool, &Key::root(), self.screen.clone());
    }

    fn key(&self, user: UserKey) -> Key {
        Key {
            user,
            parent: Some(Box::new(self.parent.clone())),
        }
    }

    fn begin_control(&mut self, key: Key) {
        let parent = self.pool.get(&self.parent).expect("missing parent in pool");

        // Figure out where this new control needs to be placed in the parent's children.
        let child_index = if let Some(prev_sibling) = &self.prev_sibling {
            // Find where prev_sibling is, and just return the index after it.
            parent
                .children
                .iter()
                .position(|child| child == prev_sibling)
                .expect("prev_sibling is not actually a sibling")
                + 1
        } else {
            // This is the first child.
            0
        };

        // Insert control into children at child_index.
        if let Some(previous) = self.pool.get(&key) {
            // The control existed on the previous frame, and therefore needs moving.

            assert!(
                previous.updated_frame_no != self.frame_no,
                "controls must not share keys; verify keys are unique among siblings",
            );

            // Where was it previously?
            let prev_index = parent
                .children
                .iter()
                .position(|child| child == &previous.key)
                .expect("control changed parents");

            if prev_index != child_index {
                // Move the control to the right place by swapping. This is quicker than a remove then reinsert as only one
                // element needs to be shifted, and is also a no-op if the indices are equal (very likely).

                // Verify swap isn't a logical error: the control that was previously at child_index must be old.
                debug_assert!(self.pool.get(&parent.children[child_index]).unwrap().is_old(self.frame_no));

                let parent = self.pool.get_mut(&self.parent).unwrap();
                parent.children.swap(child_index, prev_index);
            }
        } else {
            // This control is new on this frame!
            let parent = self.pool.get_mut(&self.parent).unwrap();
            parent.children.insert(child_index, key.clone());
        }

        // Set up (potentially new) control.
        let frame_no = self.frame_no;
        let _control = self.pool.entry(key.clone())
            .and_modify(|control| {
                control.touch(frame_no);
            })
            .or_insert_with(|| Control {
                key: key.clone(),
                widget: None,
                is_visible: true,
                updated_frame_no: frame_no,
                children: Vec::new(),
                layout: Layout::default(),

                // This will be calculated later.
                calculated_region: Region {
                    rect: Rect::zero(),
                    layer: LAYER_DEFAULT,
                },

                is_mouse_intersecting: false,
            });

        // Enter into this control.
        self.parent = key;
        self.prev_sibling = None;
    }

    fn end_control(&mut self) {
        let old_parent = self.parent.clone();
        self.forget_old_children(&old_parent);

        // Move up.
        self.parent = *(self.parent.parent.take().unwrap());
        self.prev_sibling = Some(old_parent);
    }

    fn forget_old_children(&mut self, control_key: &Key) {
        let control = &self.pool[control_key];

        // Find the first child that was not updated ('old'), and truncate from then on.
        // This works because all of the new children will populate the start of the vec, and have swap-shifted the old
        // ones to the right - like a bubble sort partition.
        if let Some(first_old) = control.children
            .iter()
            .position(|child| {
                self.pool[child].is_old(self.frame_no)
            })
        {
            let control = self.pool.get_mut(control_key).unwrap();

            if cfg!(debug_assertions) {
                let removed: Vec<Key> = control.children.drain(first_old..).collect();

                drop(control);

                // Verify the removed children are ALL old.
                for child in removed {
                    assert!(self.pool[&child].is_old(self.frame_no));
                }
            } else {
                // Equivalent, but unchecked.
                control.children.truncate(first_old);
            }
        }
    }
}

impl UiFrame<'_> {
    fn current(&self) -> &Control {
        let key;
        if let Some(prev_sibling) = self.ui.prev_sibling.as_ref() {
            key = prev_sibling;
        } else {
            key = &self.ui.parent;
        }

        &self.ui.pool[key]
    }

    fn current_mut(&mut self) -> &mut Control {
        let key;
        if let Some(prev_sibling) = self.ui.prev_sibling.as_ref() {
            key = prev_sibling;
        } else {
            key = &self.ui.parent;
        }

        self.ui.pool.get_mut(key).unwrap()
    }

    /// Sets the layout parameters of the current control.
    pub fn set_layout(&mut self, layout: Layout) {
        self.current_mut().layout = layout;
    }

    /// Force-sets the size of the current control.
    pub fn set_size(&mut self, width: f32, height: f32) {
        let layout = &mut self.current_mut().layout;

        layout.width = width..=width;
        layout.height = width..=height;
    }

    /// Sets whether the current control is visible or not.
    /// An invisible control does not get draw, and neither does its children.
    pub fn set_visible(&mut self, is_visible: bool) {
        self.current_mut().is_visible = is_visible;
    }

    /// Returns true if the mouse is over the current control, on this layer only.
    /// Inputs are reported on a need-to-know basis, so avoid conditionally calling this method.
    pub fn is_mouse_over(&mut self) -> bool {
        let key = self.current().key.clone();
        self.ui.cares_about_mouse_intersect.entry(LAYER_DEFAULT) // TODO: layer
            .or_insert(Vec::new())
            .push(key);

        self.current_mut().is_mouse_intersecting
    }

    pub fn div<K: Into<UserKey>, F: FnOnce(&mut Self)>(&mut self, key: K, f: F) {
        let key = self.ui.key(key.into());

        self.ui.begin_control(key);

        let ctrl = self.current_mut();

        if let Some(Widget::Div) = ctrl.widget.as_ref() {
            // Update.
        } else {
            // Mount.
            ctrl.widget = Some(Widget::Div);
        }

        f(self);

        self.ui.end_control();
    }

    /// Adds a basic text label.
    pub fn text<K: Into<UserKey>, S: Into<String>>(&mut self, key: K, text: S) {
        self.ui.begin_control(self.ui.key(key.into()));

        let ctrl = self.current_mut();

        if let Some(Widget::Text(string)) = ctrl.widget.as_mut() {
            // Update.
            *string = text.into();
        } else {
            // Mount.
            ctrl.widget = Some(Widget::Text(text.into()));
        }

        self.ui.end_control();
    }

    /// Adds a clickable button.
    pub fn button<K: Into<UserKey>, F: FnOnce(&mut Self)>(&mut self, key: K, f: F) {
        let key = self.ui.key(key.into());

        self.ui.begin_control(key);

        let ctrl = self.current_mut();

        ctrl.layout.direction = Dir::Row;
        ctrl.layout.width = 100.0..=f32::INFINITY;
        ctrl.layout.height = 32.0..=f32::INFINITY;

        if let Some(Widget::Button {}) = ctrl.widget.as_ref() {
            // Update.
        } else {
            // Mount.
            ctrl.widget = Some(Widget::Button {});
        }

        f(self);

        self.ui.end_control();
    }
}

impl Key {
    /// Returns the key of the root control. The root is guaranteed to always exist in `Ui::pool`.
    pub const fn root() -> Self {
        Self {
            user: 0,
            parent: None,
        }
    }
}

impl Control {
    fn is_old(&self, frame_no: u8) -> bool {
        frame_no != self.updated_frame_no
    }

    fn touch(&mut self, frame_no: u8) {
        self.updated_frame_no = frame_no;
    }
}
