// Yeah thats right American spelling
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct Color(pub u8, pub u8, pub u8, pub u8); // u8 as Colors often need to be hashed (cached)

pub const WHITE: Color = Color(255, 255, 255, 255);
pub const BLACK: Color = Color(0, 0, 0, 255);
pub const GREEN: Color = Color(0, 255, 0, 255);

// Mamar theme
pub const PURPLE: Color = Color::hex(0x807FFF);
pub const BACKGROUND: Color = Color::hex(0x131217);

impl Color {
    /// Converts a CSS-style hex colour code to a Color.
    /// Alpha is assumed to be 100%.
    pub const fn hex(rgb: u32) -> Self {
        Color(
            ((rgb >> 16) & 0xFF) as u8,
            ((rgb >> 8) & 0xFF) as u8,
            (rgb & 0xFF) as u8,
            255,
        )
    }

    pub fn as_rgba_u8_tuple(&self) -> (u8, u8, u8, u8) {
        (self.0, self.1, self.2, self.3)
    }

    pub fn as_rgba_f32(&self) -> [f32; 4] {
        [
            self.0 as f32 / 255.0,
            self.1 as f32 / 255.0,
            self.2 as f32 / 255.0,
            self.3 as f32 / 255.0,
        ]
    }

    pub fn as_rgba_f32_tuple(&self) -> (f32, f32, f32, f32) {
        (
            self.0 as f32 / 255.0,
            self.1 as f32 / 255.0,
            self.2 as f32 / 255.0,
            self.3 as f32 / 255.0,
        )
    }
}
