// Yeah thats right American spelling
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub struct Color(u8, u8, u8, u8); // u8 as Colors often need to be hashed (cached)

impl Color {
    pub fn as_rgba_f32(&self) -> [f32; 4] {
        [
            self.0 as f32 / 255.0,
            self.1 as f32 / 255.0,
            self.2 as f32 / 255.0,
            self.3 as f32 / 255.0,
        ]
    }
}

pub const WHITE: Color = Color(255, 255, 255, 255);
pub const BLACK: Color = Color(0, 0, 0, 255);
pub const GREEN: Color = Color(0, 255, 0, 255);
