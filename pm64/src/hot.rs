// TODO: migrate this to its own module probably, shouldn't live in pm64

use std::io::prelude::*;
use std::io::{Cursor, ErrorKind};
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc::{Sender, Receiver, RecvTimeoutError};

use crate::rw::*;

struct Packet<'a> {
    message: &'a str,
    data: &'a [u8],
}

impl<'a> Packet<'a> {
    const fn hot_bgm(bgm_data: &'a [u8]) -> Packet<'a> {
        Packet {
            message: "HOT_BGM",
            data: bgm_data,
        }
    }

    fn send(&self, stream: &mut TcpStream) -> Result<(), std::io::Error>  {
        // We have to write to an in-memory buffer because the client expects the head of the packet to be
        // send in a single TCP packet, not spread across multiple (which can happen if we don't write in a
        // single `stream.write_all` operation).
        let mut cur = Cursor::new(Vec::with_capacity(self.data.len() + 0x14));
        cur.write_cstring_lossy(self.message, 16)?;
        cur.write_u32_be(self.data.len() as u32)?;
        cur.write_all(self.data)?;

        stream.write_all(&cur.get_ref())?;
        stream.flush()?;

        Ok(())
    }
}

const PING: Packet = Packet {
    message: "PING",
    data: &[],
};

const PONG: Packet = Packet {
    message: "PONG",
    data: &[1, 0, 0],
};

/// Server implementation of https://github.com/pmret/hot-reload/blob/main/protocol.md. Allows sending
/// BGM data to an emulator for it to be played back.
///
/// - `state_sender`: A sender of `true` when a client connects or `false` when a client disconnects.
/// - `bgm_receiver`: A receiver of encoded BGM bytes to upload to an emulator.
///
/// This function **blocks the thread** until the `bgm_receiver` channel is closed. Run it in a thread.
pub fn run(state_sender: Sender<bool>, bgm_receiver: Receiver<Vec<u8>>) -> Result<(), std::io::Error> {
    let listener = TcpListener::bind("127.0.0.1:65432")?;

    // Client-handling loop. We only need to support one client at once.
    'listen: loop {
        log::info!("listening for new client");

        // Tell the main thread that there are no connected clients.
        let _ = state_sender.send(false);

        // Block until we receieve a new connection.
        let (mut stream, _) = listener.accept()?;

        log::info!("client connected");

        // Send handshake PING.
        if let Err(_) = PING.send(&mut stream) {
            continue;
        }

        // Respond to handshake PING sent by client.
        loop {
            match stream.read_cstring(16) {
                Ok(s) if s == "PING" => {
                    if let Err(_) = PONG.send(&mut stream) {
                        continue 'listen;
                    }

                    break;
                }
                _ => {
                    continue 'listen;
                }
            }
        }

        log::trace!("handshake ok");

        // Tell the main thread that a connection has been made.
        let _ = state_sender.send(true);

        stream.set_nonblocking(true).unwrap();

        loop {
            // Attempt to read data from the client, then throw it away.
            // We do this to check if the client is still connected.
            match stream.read(&mut Vec::new()) {
                Ok(_) => (), // TODO: actually read the packet
                Err(error) if error.kind() == ErrorKind::Interrupted => (),
                Err(error) if error.kind() == ErrorKind::WouldBlock => (),
                Err(_) => break,
            }

            // Wait for some BGM data on the channel, and send it.
            match bgm_receiver.recv_timeout(std::time::Duration::from_millis(500)) {
                Ok(bgm_data) => {
                    log::info!("sending BGM to client");

                    match Packet::hot_bgm(&bgm_data).send(&mut stream) {
                        Ok(_) => (),
                        Err(error) if error.kind() == ErrorKind::Interrupted => (),
                        Err(_) => break,
                    }
                },
                Err(RecvTimeoutError::Disconnected) => break 'listen, // Channel was closed, so we'll return
                Err(RecvTimeoutError::Timeout) => (),
            }

            // Don't eat the CPU!!
            std::thread::yield_now();
        }
    }

    let _ = state_sender.send(false);

    Ok(())
}
