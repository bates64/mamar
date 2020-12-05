#![allow(dead_code)]

use wasm_bindgen::prelude::*;
use std::fmt;

#[cfg(feature="electron")]
#[wasm_bindgen(module = "/src/os/detect_os_electron.js")]
extern "C" {
    fn detect_os() -> String;
}

#[cfg(not(feature="electron"))]
#[wasm_bindgen(module = "/src/os/detect_os_web.js")]
extern "C" {
    fn detect_os() -> String;
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum Os {
    Mac,
    Windows,
    Linux,
}

impl Os {
    pub fn detect() -> Self {
        match detect_os().as_ref() {
            "mac" => Os::Mac,
            "windows" => Os::Windows,
            "linux" => Os::Linux,
            _ => panic!(),
        }
    }

    pub fn is_mac(&self) -> bool {
        *self == Os::Mac
    }

    pub fn is_windows(&self) -> bool {
        *self == Os::Windows
    }

    pub fn is_linux(&self) -> bool {
        *self == Os::Linux
    }

    pub fn is_unix(&self) -> bool {
        self.is_mac() || self.is_linux()
    }
}

impl fmt::Display for Os {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Os::Mac => write!(f, "macOS"),
            Os::Windows => write!(f, "Windows"),
            Os::Linux => write!(f, "Linux"),
        }
    }
}
