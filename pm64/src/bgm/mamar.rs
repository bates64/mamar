use std::collections::HashMap;

use log::debug;
use serde_derive::{Deserialize, Serialize};

pub const MAGIC: &str = "MAMAR";
pub const MAGIC_MAX_LEN: usize = 8;

/// Written in MessagePack after the "end" of a BGM, preceded by a "MAMAR" magic string.
#[derive(Clone, Default, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct Metadata {
    /// Maps track list pos to vec of track names, excluding the master track.
    track_names: HashMap<u16, Vec<String>>,
}

impl Metadata {
    pub fn has_data(&self) -> bool {
        // Look for any non-empty track name
        self.track_names
            .values()
            .any(|names| names.iter().any(|name| !name.is_empty()))
    }

    pub fn apply_to_bgm(&self, bgm: &mut super::Bgm) {
        debug!("{:?}", self.track_names);
        for (id, track_list) in &mut bgm.track_lists {
            let Some(names) = self.track_names.get(&(*id as u16)) else {
                debug!("no names for {id:X}");
                continue;
            };

            for (track, name) in track_list.tracks.iter_mut().skip(1).zip(names.iter()) {
                track.name = name.clone();
            }
        }
    }

    pub fn add_track_name(&mut self, tracks_pos: u16, name: String) {
        let names = self.track_names.entry(tracks_pos).or_default();
        names.push(name);
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::bgm::{Bgm, Segment, Track, TrackList, Variation};

    #[test]
    fn encode_decode_metadata_preserves_track_names() {
        use std::collections::BTreeMap;

        let track_list = TrackList {
            pos: Some(0x1234),
            tracks: core::array::from_fn(|_| Track::default()),
        };
        let mut bgm = Bgm {
            track_lists: BTreeMap::from([(0x1234, track_list)]),
            variations: [
                Some(Variation {
                    segments: vec![Segment::Subseg {
                        id: Some(0),
                        track_list: 0x1234,
                    }],
                }),
                Default::default(),
                Default::default(),
                Default::default(),
            ],
            ..Default::default()
        };

        let mut metadata = Metadata::default();
        metadata.add_track_name(0x1234, "My Cool Track".to_string());

        metadata.apply_to_bgm(&mut bgm);
        assert_eq!(bgm.track_lists[&0x1234].tracks[1].name, "My Cool Track");

        let data = bgm.as_bytes().unwrap();

        let bgm2 = Bgm::from_bytes(&data).unwrap();
        assert_eq!(bgm2.track_lists.len(), 1);
        for (_, track_list) in bgm2.track_lists {
            assert_eq!(track_list.tracks[1].name, "My Cool Track");
        }
    }
}
