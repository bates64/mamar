use std::io::prelude::*;
use std::io::{Error, ErrorKind, Result, SeekFrom};

pub trait SeekExt: Seek {
    fn pos(&mut self) -> Result<u64>;
}

impl<S: Seek> SeekExt for S {
    fn pos(&mut self) -> Result<u64> {
        self.stream_position()
    }
}

pub trait ReadExt: Read {
    fn read_u8(&mut self) -> Result<u8>;
    fn read_i8(&mut self) -> Result<i8>;
    fn read_u16_be(&mut self) -> Result<u16>;
    fn read_i16_be(&mut self) -> Result<i16>;
    fn read_u32_be(&mut self) -> Result<u32>;
    fn read_padding(&mut self, num_bytes: u32) -> Result<()>;
    fn read_cstring(&mut self, max_len: u64) -> Result<String>; // len includes null terminator
}

impl<R: Read> ReadExt for R {
    fn read_u8(&mut self) -> Result<u8> {
        let mut buffer = [0; 1];
        self.read_exact(&mut buffer)?;
        Ok(buffer[0])
    }

    fn read_i8(&mut self) -> Result<i8> {
        self.read_u8().map(|i| i as i8)
    }

    fn read_u16_be(&mut self) -> Result<u16> {
        let mut buffer = [0; 2];
        self.read_exact(&mut buffer)?;
        Ok(u16::from_be_bytes(buffer))
    }

    fn read_i16_be(&mut self) -> Result<i16> {
        let mut buffer = [0; 2];
        self.read_exact(&mut buffer)?;
        Ok(i16::from_be_bytes(buffer))
    }

    fn read_u32_be(&mut self) -> Result<u32> {
        let mut buffer = [0; 4];
        self.read_exact(&mut buffer)?;
        Ok(u32::from_be_bytes(buffer))
    }

    fn read_padding(&mut self, num_bytes: u32) -> Result<()> {
        for _ in 0..num_bytes {
            if self.read_u8()? != 0 {
                return Err(Error::new(ErrorKind::InvalidData, "padding expected"));
            }
        }

        Ok(())
    }

    fn read_cstring(&mut self, max_len: u64) -> Result<String> {
        let buffer: Result<Vec<u8>> = self.take(max_len).bytes().collect();
        let mut buffer = buffer?;

        // Resize `buffer` up to - but not including - its null terminator (if any)
        let mut i = 0;
        while i < buffer.len() {
            if buffer[i] == 0 {
                buffer.truncate(i);
                break;
            }

            i += 1;
        }

        String::from_utf8(buffer).map_err(|err| Error::new(ErrorKind::InvalidData, err))
    }
}

pub trait WriteExt: Write + Seek {
    fn write_u8(&mut self, value: u8) -> Result<()>;
    fn write_i8(&mut self, value: i8) -> Result<()>;
    fn write_u16_be(&mut self, value: u16) -> Result<()>;
    fn write_i16_be(&mut self, value: i16) -> Result<()>;
    fn write_u32_be(&mut self, value: u32) -> Result<()>;
    fn write_cstring_lossy(&mut self, string: &str, max_len: usize) -> Result<()>; // len includes null terminator

    /// Seeks to a position, writes the value, then seeks back.
    fn write_u16_be_at(&mut self, value: u16, pos: SeekFrom) -> Result<()>;
    fn write_u32_be_at(&mut self, value: u32, pos: SeekFrom) -> Result<()>;

    /// Seeks forward until the position is aligned to the given alignment.
    fn align(&mut self, alignment: u64) -> Result<()>;
}

impl<W: Write + Seek> WriteExt for W {
    fn write_u8(&mut self, value: u8) -> Result<()> {
        self.write_all(&[value])
    }

    fn write_i8(&mut self, value: i8) -> Result<()> {
        self.write_all(&value.to_be_bytes())
    }

    fn write_u16_be(&mut self, value: u16) -> Result<()> {
        self.write_all(&value.to_be_bytes())
    }

    fn write_i16_be(&mut self, value: i16) -> Result<()> {
        self.write_all(&value.to_be_bytes())
    }

    fn write_u32_be(&mut self, value: u32) -> Result<()> {
        self.write_all(&value.to_be_bytes())
    }

    fn write_cstring_lossy(&mut self, string: &str, max_len: usize) -> Result<()> {
        let mut bytes: Vec<u8> = string
            .chars()
            .filter(|ch| ch.len_utf8() == 1)
            .take(max_len - 1)
            .map(|ch| {
                let mut b = [0; 1];
                ch.encode_utf8(&mut b);
                b[0]
            })
            .collect();
        bytes.resize(max_len, 0); // add null terminator(s) to reach `max_len`
        self.write_all(&bytes)
    }

    fn write_u16_be_at(&mut self, value: u16, pos: SeekFrom) -> Result<()> {
        let old_pos = self.pos()?;
        self.seek(pos)?;
        self.write_u16_be(value)?;
        self.seek(SeekFrom::Start(old_pos))?;
        Ok(())
    }

    fn write_u32_be_at(&mut self, value: u32, pos: SeekFrom) -> Result<()> {
        let old_pos = self.pos()?;
        self.seek(pos)?;
        self.write_u32_be(value)?;
        self.seek(SeekFrom::Start(old_pos))?;
        Ok(())
    }

    fn align(&mut self, alignment: u64) -> Result<()> {
        let pos = self.pos()?;

        if pos % alignment == 0 {
            // Nothing to do
            return Ok(());
        }

        // Calculate next multiple of `alignment`
        let rounded_pos = pos + alignment; // NEXT multiple, not closest
        let new_pos = (rounded_pos / alignment) * alignment;

        // Write zeroes
        let delta = new_pos - pos;
        for _ in 0..delta {
            self.write_u8(0)?;
        }

        Ok(())
    }
}

/// Aligns a value to the next multiple of n.
pub fn align(value: u32, n: u32) -> u32 {
    if n <= 1 {
        return value;
    }

    if value % n == 0 { n } else { value + (n - value % n) }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn test_align() {
        assert_eq!(align(0, 5), 5);
        assert_eq!(align(5, 5), 5);
        assert_eq!(align(6, 5), 10);

        // 0 and 1 values for `n` should be a no-op
        assert_eq!(align(36, 0), 36);
        assert_eq!(align(36, 1), 36);
    }
}
