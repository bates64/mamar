#!/bin/sh
# Builds papermario-dx's audio engine, and mupen64plus's emulation of the RSP microcode it drives, to WebAssembly.
# DX_DIR is the papermario-dx checkout to build the engine from, relative to the repository's root.
set -e
# Nix's clang wrapper adds hardening flags that WebAssembly doesn't support, and warns about the target
export NIX_HARDENING_ENABLE=""
export NIX_CC_WRAPPER_SUPPRESS_TARGET_WARNING=1
cd "$(dirname "$0")"
if [ -z "$DX_DIR" ]; then
    echo "Set DX_DIR to a papermario-dx checkout, relative to the repository's root" >&2
    exit 1
fi
audio="../$DX_DIR/src/audio"
rm -rf build
mkdir -p build
# include comes first so its stand-ins for the game's headers are used rather than the game's own
CFLAGS="--target=wasm32 -std=c23 -D_LANGUAGE_C -DSHIFT -DMAMAR_WASM -DM64P_BIG_ENDIAN -O2 -ffreestanding -nostdlib
    -fno-builtin-printf -fno-delete-null-pointer-checks -Wno-everything -Iinclude -Iinclude/libc -I. -I$audio/.. -idirafter ../$DX_DIR/include"
# src/glue.c stands in for system.c, which drives the N64's hardware
SOURCES="$(ls "$audio"/*.c "$audio"/core/*.c rsp-hle/*.c src/*.c | grep -v /core/system.c)"
for source in $SOURCES; do
    clang $CFLAGS -c "$source" -o "build/$(basename "$(dirname "$source")")_$(basename "$source").o"
done
# The RSP emulation masks addresses to 24 bits, so all memory must stay below 16 MiB
wasm-ld --no-entry -z stack-size=262144 --initial-memory=4194304 --max-memory=16777216 -o build/mamar_audio.wasm build/*.o
