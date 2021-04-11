use std::error::Error;
use std::path::Path;
use std::collections::HashMap;

use image::GenericImageView;
use imui::{Rect, Point, Size};
use rect_packer::Packer;
use glium::backend::Facade;
use glium::texture::{Texture2d, RawImage2d, TextureCreationError};

const INITIAL_HEIGHT: u32 = 1024;
const INITIAL_WIDTH: u32 = 1024;

pub struct TextureAtlas {
    texture: Texture2d,
    packer: Packer,
    map: HashMap<SpriteId, Sprite>,
}

pub struct Sprite {
    /// Where this texture is found on the atlas, in UV (0.0..1.0) coordinates.
    pub uv_rect: Rect,

    /// Dimensions of the source image.
    pub src_dimensions: Size,
}

#[derive(Debug, PartialEq, Eq, Hash)]
pub enum SpriteId {
    StaticStr(&'static str),
    Glyph(fontdue::layout::GlyphRasterConfig),
}

impl TextureAtlas {
    pub fn new<F: Facade>(facade: &F) -> Result<Self, TextureCreationError> {
        Ok(TextureAtlas {
            texture: Texture2d::empty(facade, INITIAL_WIDTH, INITIAL_HEIGHT)?,
            packer: Packer::new(rect_packer::Config {
                width: INITIAL_WIDTH as i32,
                height: INITIAL_HEIGHT as i32,
                border_padding: 4,
                rectangle_padding: 4,
            }),
            map: HashMap::new(),
        })
    }

    pub fn texture(&self) -> &Texture2d {
        &self.texture
    }

    /// Inserts an image into the atlas.
    pub fn insert<I, P>(&mut self, id: I, path: P) -> Result<Option<Sprite>, Box<dyn Error>>
    where
        I: Into<SpriteId>,
        P: AsRef<Path>,
    {
        let image = image::io::Reader::open(path)?.decode()?;
        let data = image.as_rgba8().unwrap().to_vec();

        Ok(self.insert_raw(id, RawImage2d::from_raw_rgba(data, image.dimensions())))
    }

    pub fn insert_raw<I, R>(&mut self, id: I, image: RawImage2d<'_, R>) -> Option<Sprite>
    where
        I: Into<SpriteId>,
        R: glium::texture::PixelValue + Clone,
    {
        let id = id.into();

        if let Some(rect) = self.packer.pack(image.width as i32, image.height as i32, false) {
            assert!(rect.width == image.width as i32);
            assert!(rect.height == image.height as i32);

            // Convert rect to UV coordinates.
            let uv_rect = Rect {
                origin: Point::new(
                    rect.x as f32 / self.texture.width() as f32,
                    rect.y as f32 / self.texture.height() as f32,
                ),
                size: Size::new(
                    rect.width as f32 / self.texture.width() as f32,
                    rect.height as f32 / self.texture.height() as f32,
                ),
            };

            // Check uv_rect is actually in UV coordinates.
            assert!(uv_rect.min_x() >= 0.0);
            assert!(uv_rect.min_y() >= 0.0);
            assert!(uv_rect.max_x() <= 1.0);
            assert!(uv_rect.max_y() <= 1.0);

            // Add the sprite to the map.
            let old = self.map.insert(id, Sprite {
                uv_rect,
                src_dimensions: Size::new(rect.width as f32, rect.height as f32),
            });

            // Actually write the sprite image to our texture.
            self.texture.write(glium::Rect {
                left: rect.x as u32,
                bottom: rect.y as u32,
                width: rect.width as u32,
                height: rect.height as u32,
            }, image);

            old
        } else {
            todo!("resize TextureAtlas when out of space")
        }
    }

    pub fn get<I>(&self, id: I) -> Option<&Sprite>
    where
        I: Into<SpriteId>,
    {
        self.map.get(&id.into())
    }
}

impl From<&'static str> for SpriteId {
    fn from(s: &'static str) -> Self {
        SpriteId::StaticStr(s)
    }
}

impl From<fontdue::layout::GlyphRasterConfig> for SpriteId {
    fn from(g: fontdue::layout::GlyphRasterConfig) -> Self {
        SpriteId::Glyph(g)
    }
}
