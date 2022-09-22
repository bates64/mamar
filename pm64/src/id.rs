use std::sync::atomic::{AtomicU32, Ordering};

pub type Id = u32;

pub fn gen_id() -> Id {
    static NEXT_ID: AtomicU32 = AtomicU32::new(0);

    NEXT_ID.fetch_add(1, Ordering::Relaxed)
}
