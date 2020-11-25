///! These tests and benchmarks run on data extracted from a vanilla Paper Mario (U) ROM.
///! Run the following script to extract them:
///!
///!     $ ./bin/extract.py path/to/papermario.z64
///!
///! Each test checks for the following property:
///!
///!     encode(decode(bin)) == bin
///!
///! That is, decoding and re-encoding a song with no changes must equal the original input. We call this
///! **matching**, and it's required for the [decompilation project](https://github.com/ethteck/papermario).
///! It is also helpful as a generic test suite for any inconsistencies between the `de` and `en` modules.

use std::{path::Path, fs::File, io::prelude::*, io::Cursor};
use codec::Bgm;

/// Tests that the given song can be decoded then re-encoded to give the original input.
macro_rules! test_song {
    ($song:ident) => {
        #[allow(non_snake_case)]
        #[test]
        fn $song() {
            let bin_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("bin");

            // Decode the song
            let original = include_bytes!(concat!("bin/", stringify!($song), ".bin"));
            let bgm = Bgm::decode(&mut Cursor::new(original)).expect("decode error");

            println!("------------");

            // Encode the Bgm
            let mut encoded = Cursor::new(Vec::new());
            bgm.encode(&mut encoded).unwrap();
            let encoded = encoded.into_inner();

            // Check the output matches
            if encoded != original {
                // Output `encoded` to a file for debugging...
                let nonmatching_bin = concat!(stringify!($song), ".nonmatching.bin");
                let mut out = File::create(bin_dir.join(nonmatching_bin)).expect("write nonmatching.bin");
                out.write_all(&encoded).unwrap();

                // ...and fail the test.
                panic!("Re-encoded song did not match original. Wrote non-matching output to tests/bin/{}", nonmatching_bin);
            }
        }
    };
}

// TODO: add all songs
test_song!(Cloudy_Climb_32);
//test_song!(Angry_Bowser_67);
test_song!(Resting_at_the_Toad_House_88);
test_song!(Pleasant_Path_11);
