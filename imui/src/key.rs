use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;
use std::any::TypeId;

#[derive(Debug, PartialEq, Eq, Hash, Clone)]
pub struct UserKey(pub u64);

pub trait UniqueKey {
    fn key(&self) -> UserKey;
}

impl<T: Hash + 'static> UniqueKey for T {
    fn key(&self) -> UserKey {
        let mut hasher = DefaultHasher::new();
        self.hash(&mut hasher);
        TypeId::of::<T>().hash(&mut hasher);
        UserKey(hasher.finish())
    }
}
