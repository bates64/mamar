use glium::glutin::window::Icon;

#[cfg(any(target_os = "linux", target_os = "windows"))]
pub fn get_icon() -> Option<Icon> {
    // Generated with https://github.com/y15un/png-to-32bpp-rgba
    let data = include_bytes!("../../../assets/icon.dat").to_vec();

    Icon::from_rgba(data, 128, 128).ok()
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
pub fn get_icon() -> Option<Icon> {
    // winit::window::Window::set_window_icon does nothing on platforms other than Linux and Windows, so we can
    // skip embedding icon.dat and just return None here.
    // https://docs.rs/winit/0.24.0/winit/window/struct.Window.html#method.set_window_icon
    None
}
