use {
    std::{
        io::{
            Cursor,
            prelude::*
        },
        net::{TcpListener, TcpStream},
        sync::mpsc::Receiver,
    },
    super::rw_util::*,
};

// Server implementation of https://github.com/pmret/hot-reload/blob/main/protocol.md
// TODO: implement rest of protocol (i.e. ERROR)
// TODO: support more than one client
// TODO: handle client disconnect
// TODO: communicate list of connected clients to UI thread
pub fn run(rx: Receiver<Vec<u8>>) -> ! {
    let listener = TcpListener::bind("127.0.0.1:65432").unwrap();
    println!("listening for hot-reload clients");

    let (mut stream, _) = listener.accept().unwrap();

    println!("client connected, performing handshake");

    struct Packet<'a> {
        message: &'a str,
        data: &'a [u8],
    }

    impl<'a> Packet<'a> {
        fn send(&self, stream: &mut TcpStream) {
            // We have to write to an in-memory buffer because the client expects the head of the packet to be
            // send in a single TCP packet, not spread across multiple (which can happen if we don't write in a
            // single `stream.write_all` operation).
            let mut cur = Cursor::new(Vec::with_capacity(self.data.len() + 0x14));
            cur.write_cstring_lossy(self.message, 16).unwrap();
            cur.write_u32_be(self.data.len() as u32).unwrap();
            cur.write_all(self.data).unwrap();

            stream.write_all(&cur.get_ref()).unwrap();
            stream.flush().unwrap();
        }
    }

    // Send handshake PING
    Packet {
        message: "PING",
        data: &[],
    }.send(&mut stream);

    // Respond to handshake PING sent by client
    loop {
        if stream.read_cstring(16).unwrap() == "PING" {
            Packet {
                message: "PONG",
                data: &[1, 0, 0],
            }.send(&mut stream);
            break;
        }
    }

    println!("handshake ok");

    loop {
        let bgm_data = rx.recv().unwrap();

        println!("sending BGM to client");

        Packet {
            message: "HOT_BGM",
            data: &bgm_data,
        }.send(&mut stream);
    }
}
