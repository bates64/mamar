{
  description = "Paper Mario music editor";
  inputs = {
    flake-schemas.url = "https://flakehub.com/f/DeterminateSystems/flake-schemas/*.tar.gz";
    nixpkgs.url = "https://flakehub.com/f/NixOS/nixpkgs/*.tar.gz";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };
  outputs =
    {
      self,
      flake-schemas,
      nixpkgs,
      rust-overlay,
    }:
    let
      overlays = [
        rust-overlay.overlays.default
        (final: prev: {
          rustToolchain = final.rust-bin.nightly.latest.default.override {
            targets = [ "wasm32-unknown-unknown" ];
            extensions = [ "rust-src" ];
          };
        })
      ];
      supportedSystems = [
        "x86_64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
      ];
      forEachSupportedSystem =
        f:
        nixpkgs.lib.genAttrs supportedSystems (
          system:
          f {
            pkgs = import nixpkgs { inherit overlays system; };
          }
        );
    in
    {
      schemas = flake-schemas.schemas;
      devShells = forEachSupportedSystem (
        { pkgs }:
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              nodejs
              yarn
              rustToolchain
              cargo-bloat
              cargo-edit
              cargo-outdated
              cargo-udeps
              cargo-watch
              rust-analyzer
              nixpkgs-fmt
              wasm-pack
            ];
            env = {
              RUST_BACKTRACE = "1";
            };
            shellHook = "yarn install";
          };
        }
      );
      formatter = forEachSupportedSystem ({ pkgs }: pkgs.nixpkgs-fmt);
      # TODO: output a package
    };
}
