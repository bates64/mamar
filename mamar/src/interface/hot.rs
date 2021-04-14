use std::sync::mpsc::{channel, Sender, Receiver};

/// An interface for talking to an emulator ('hot-reloading').
pub struct Hot {
    bgm_tx: Sender<Vec<u8>>,
    conn_state_rx: Receiver<bool>,

    is_client_connected: bool,
}

impl Hot {
    pub fn new() -> Self {
        let (bgm_tx, bgm_rx) = channel();
        let (conn_state_tx, conn_state_rx) = channel();

        // This thread runs in the background, but it will kill itself once `bgm_rx` is dropped (i.e. Hot is dropped).
        std::thread::spawn(move || {
            pm64::hot::run(conn_state_tx, bgm_rx)
                .expect("hot thread died unexpectedly");
        });

        Hot {
            bgm_tx,
            conn_state_rx,
            is_client_connected: false,
        }
    }

    /// Check for events. Returns `true` if state changed.
    pub fn update(&mut self) -> bool {
        if let Some(new_state) = self.conn_state_rx.try_iter().last() {
            if new_state != self.is_client_connected {
                self.is_client_connected = new_state;
                return true;
            }
        }

        false
    }

    pub fn has_connections(&self) -> bool {
        self.is_client_connected
    }

    /// Queues playback of the given BGM. If no client is currently connected, this will play when one does.
    pub fn play_bgm(&mut self, bgm: &pm64::bgm::Bgm) -> Result<(), pm64::bgm::en::Error> {
        let _ = self.bgm_tx.send(bgm.as_bytes()?);
        Ok(())
    }
}
