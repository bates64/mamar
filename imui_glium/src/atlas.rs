use std::error::Error;
use std::path::PathBuf;
use std::collections::HashMap;

use image::GenericImageView;
use imui::{Rect, Point, Size};
use rect_packer::Packer;
use glium::backend::Facade;
use glium::texture::{Texture2d, RawImage2d, TextureCreationError};

pub struct TextureAtlas {
    texture: Texture2d,
    packer: Packer,
    map: HashMap<SpriteId, Sprite>,
}

pub struct Sprite {
    /// The path to the source image file.
    path: PathBuf,

    /// Where this texture is found on the atlas, in UV (0.0..1.0) coordinates.
    rect: Rect,
}

#[derive(Debug, PartialEq, Eq, Hash)]
pub enum SpriteId {
    StaticStr(&'static str),
}

impl TextureAtlas {
    pub fn new<F: Facade>(facade: &F) -> Result<Self, TextureCreationError> {
        Ok(TextureAtlas {
            texture: Texture2d::empty(facade, 1024, 1024)?,
            packer: Packer::new(rect_packer::Config {
                width: 1024,
                height: 1024,
                border_padding: 0,
                rectangle_padding: 0,
            }),
            map: HashMap::new(),
        })
    }

    pub fn texture(&self) -> &Texture2d {
        &self.texture
    }

    /// Inserts an image into the atlas. Returns `true` if there was something at the given id previously.
    pub fn insert<I, P>(&mut self, id: I, path: P) -> Result<bool, Box<dyn Error>>
    where
        I: Into<SpriteId>,
        P: Into<PathBuf>,
    {
        let path = path.into();

        let image = image::io::Reader::open(&path)?.decode()?;
        let (width, height) = image.dimensions();

        if let Some(rect) = self.packer.pack(width as i32, height as i32, false) {
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
            let overwrote_id = self.map.insert(id.into(), Sprite {
                path,
                rect: uv_rect,
            }).is_some();

            // Actually write the sprite image to our texture.
            self.texture.write(glium::Rect {
                left: rect.x as u32,
                bottom: rect.y as u32,
                width: rect.width as u32,
                height: rect.height as u32,
            }, RawImage2d::from_raw_rgba(image.as_rgba8().unwrap().to_vec(), image.dimensions()));

            Ok(overwrote_id)
        } else {
            todo!("resize atlas")
        }
    }

    pub fn get<I>(&self, id: I) -> Option<&Rect>
    where
        I: Into<SpriteId>,
    {
        self.map.get(&id.into()).map(|sprite| &sprite.rect)
    }
}

impl From<&'static str> for SpriteId {
    fn from(s: &'static str) -> Self {
        SpriteId::StaticStr(s)
    }
}
