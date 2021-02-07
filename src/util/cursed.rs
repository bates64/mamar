///! Global mutable references.

use std::cell::Cell;
use std::sync::{Mutex, MutexGuard};
use std::marker::{Send, Sync};
use std::ops::{Deref, DerefMut};

/// A mutable smart pointer suitable as a global reference to heap-allocated data.
/// That is, it acts as a global `&mut T`.
///
/// **Safety**: a `Cursed` becomes invalid if the data it points to is dropped.
/// There are currently no checks for this, so be careful. Preferably, the data should be
/// effectively valid for the entire lifetime of your program. If possible, implement `Drop` and call `unset`
/// on the `Cursed` when the value it points to is dropped:
///
/// ```
/// use std::ops::Drop;
/// use cursed_global_ref::cursed;
///
/// struct Test;
///
/// cursed!(TEST: &mut Test);
///
/// impl Test {
///     fn new() -> Self {
///         let mut s = Self;
///         TEST.set(&mut s);
///         s
///     }
/// }
///
/// impl Drop for Test {
///     fn drop(&mut self) {
///         TEST.unset().unwrap();
///     }
/// }
/// ```
///
/// # Implementation
///
/// Cursed is a `Send + Sync` wrapper over...
///
/// ## `Mutex<_>`
///
/// Mutex is used so we don't accidentally cause data races (e.g. update(Msg::FileOperation) whilst an older
/// FileOperation's popup is still open). Without this, I doubt anything would necessarily explode [our "threads" on
/// wasm32-unknown-unknown are JavaScript Promises, which use the syncronous event loop rather than real
/// threading], but its safer to use a Mutex and it makes the compiler happy.
///
/// ## `Mutex<Cell<_>>`
///
/// The Cell wrapper provides "interior mutability," which basically allows us to move values in and out of
/// the cell without actually having a mutable global variable (as Rust doesn't have them). This means we can change
/// the pointer, globally.
///
/// ### Why not `RefCell<Model>` instead of `Cell<*mut Model>`?
///
/// The data in a Cursed may be owned elsewhere; it doesn't have to be 'static. That's the point.
///
/// ## `Mutex<Cell<*mut Model>>>`
///
/// `*mut Model` is a raw pointer to [Model], so we can read it in 'static contexts (e.g. within
/// `spawn_local` threads). Note that dereferencing raw pointers is unsafe.
pub struct Cursed<T>(Mutex<Cell<*mut T>>);

// Tell the compiler that Cursed<T> is thread-safe (a requirement for statics). This is probably really unsafe,
// especially if T doesn't implement Send+Sync. Luckily, we're on wasm32-unknown-unknown, which doesn't actually have
// threads so this should (!) never be a problem.
unsafe impl<T> Send for Cursed<T> {}
unsafe impl<T> Sync for Cursed<T> {}

impl<T> Cursed<T> {
    pub fn new_unset() -> Self {
        Self(Mutex::new(Cell::new(std::ptr::null_mut())))
    }

    /// Tries to access the pointed-to value.
    /// Returns `Err` if nothing is being pointed to or `self` is currently dereferenced somewhere else.
    pub fn get<'a>(&'a self) -> Result<Lock<'a, T>, ()> {
        log::trace!("get Cursed");
        match self.0.try_lock() {
            Ok(guard) => {
                if guard.get().is_null() {
                    Err(()) // Uninitialised.
                } else {
                    Ok(Lock(guard))
                }
            },
            Err(_) => Err(()), // Poisoned or already locked.
        }
    }

    /// Initialises the `Cursed` to point to the given value. If the value is dropped from underneath the `Cursed`,
    /// it will not notice and suddenly the `Cursed` will point to junk data (!), so be careful.
    pub fn set(&self, value: *mut T) -> Result<(), ()> {
        log::trace!("set Cursed -> {:?}", value);
        match self.0.try_lock() {
            Ok(guard) => {
                guard.set(value);
                Ok(())
            },
            Err(_) => Err(()),
        }
    }

    /// Deinitialises the pointer to null, such that it cannot be accessed until `set` is used later.
    /// This is the default state of a `Cursed`.
    pub fn unset(&self) -> Result<(), ()> {
        log::trace!("unset Cursed");
        match self.0.try_lock() {
            Ok(guard) => {
                guard.set(std::ptr::null_mut());
                Ok(())
            },
            Err(_) => Err(()),
        }
    }

    pub fn is_initialised(&self) -> Result<bool, ()> {
        match self.0.try_lock() {
            Ok(guard) => Ok(!guard.get().is_null()),
            Err(_) => Err(()),
        }
    }
}

#[derive(Debug)]
pub struct Lock<'a, T>(MutexGuard<'a, Cell<*mut T>>);

impl<'a, T> Deref for Lock<'a, T> {
    type Target = T;
    fn deref(&self) -> &Self::Target {
        let ptr = self.0.get();
        unsafe { &*ptr }
    }
}

impl<'a, T> DerefMut for Lock<'a, T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        let ptr = self.0.get();
        unsafe { &mut *ptr }
    }
}

/// Declares a new global reference.
/// It begins uninitialised and inaccessible before a [`set(&mut value)`](Cursed::set).
#[macro_export]
macro_rules! cursed {
    ($i:ident : &mut $t:ty) => {
        lazy_static::lazy_static! {
            static ref $i: ::cursed_global_ref::Cursed<$t> = ::cursed_global_ref::Cursed::new_unset();
        }
    };
    // XXX: pub(scope) not supported
    (pub $i:ident : &mut $t:ty) => {
        lazy_static::lazy_static! {
            pub static ref $i: ::cursed_global_ref::Cursed<$t> = ::cursed_global_ref::Cursed::new_unset();
        }
    };
}
