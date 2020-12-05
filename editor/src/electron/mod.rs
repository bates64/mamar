#![allow(dead_code)]

#[cfg(not(feature="electron"))]
compile_error!("module 'electron' does not support non-electron environments.");

pub mod hot_server;
pub mod window;
