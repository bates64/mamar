# rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y \
    --profile minimal \
    --target wasm32-unknown-unknown

npm ci
npm i wasm-pack
