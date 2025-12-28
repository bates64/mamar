[![Mamar](mamar-web/src/logotype.svg)](https://mamar.bates64.com)

[![](https://img.shields.io/github/actions/workflow/status/bates64/mamar/test.yml?branch=main)](https://github.com/bates64/mamar/actions)
[![](https://img.shields.io/discord/279322074412089344?color=%237289DA&logo=discord&logoColor=ffffff)](https://discord.gg/qWSxcTjktv)

Paper Mario music editor.

[Website](https://mamar.bates64.com) - [Open in your browser](https://mamar.bates64.com/app) - [Changelog](/changelog.md)

![Screenshot](mamar-web/src/screenshot.png)

---

Architecture
============

Mamar is a web app comprised of [a React frontend](/mamar-web), [Rust](/pm64) [supporting](/mamar-wasm-bridge) [libraries](/pm64-typegen) compiled to WebAssembly, [C patches](/patches) over [the Paper Mario decompilation](https://github.com/pmret/papermario), and [a custom build of mupen64plus-web](https://github.com/bates64/mupen64plus-web/tree/mamar). The whole thing is client-side only i.e. you can serve it with a simple static file server (the live site uses [Vercel](https://vercel.com/) for deployments).

Why are some parts Rust? Mamar used to be a desktop application written entirely in Rust! It's also a more suitable language for the kind of encoding/decoding of binary data that Mamar needs to do.

This is a monorepo with a number of modules in it. Following is a more detailed look at each module.

`mamar-web`
-----------

This is the React frontend writen with strict-mode TypeScript. Styles are written in SCSS, with components using [CSS modules](https://github.com/css-modules/css-modules) for local scoping. The bundler is [Parcel 2](https://parceljs.org/). There is also a landing page that briefly explains what Mamar is, whilst the app itself lives at `/app`.

Mamar uses [React Spectrum](https://react-spectrum.adobe.com/react-spectrum/index.html), Adobe's React component library. This means you can quickly build most views with just that and few design decisions need to be made. For more bespoke components, there's no need to fit within the Spectrum design system, so it's no issue to use the `UNSAFE_className` prop. The most important thing is that components are [accessible](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA) and keyboard-navigable. For example, the `PlaybackControls` component has styling that totally overrides Spectrum in order to completely rip off Garageband's UI. If you're thinking of contributing some feature but aren't much of a designer, feel free to focus on the functionality and I'll make it look nice!

State management lives in the `mamar-web/app/store` directory. The general idea is that we have a single state object that is passed to components via React hooks. State is split into "docs" (documents, but named differently to differentiate from the global builtin `document`), each of which is an open BGM. If there are multiple docs open, the app shows tabs to switch between them. The `bgm` field of docs is (de)serializable with the `pm64` module.

For performance, [react-tracked](https://react-tracked.js.org/docs/introduction/) avoids needless rerenders by figuring out exactly which properties of the state object a component depends on. Each hook also returns a `dispatch` function to change state. This calls reducers similar to a Redux store, but we don't actually use Redux. Additionally the entire store is wrapped with [use-undoable](https://www.npmjs.com/package/use-undoable) which provides a history of state changes for undo/redo functionality. Changes to anything other than a doc's BGM does not produce a new history entry (see `shouldActionCommitToHistory`), but undoing will revert the rest of the state also - this results in the UI switching back to wherever the undoable action was performed.

There aren't any tests. This would be good to add in the future to prevent regressions once the design is more settled.

Generally the only browsers we care about are Chrome and Firefox on desktop. I would like to support other engines and mobile devices however WebAssembly speed is really not there yet so there isn't much point.

`pm64`
------

This is a Rust crate that provides encoding and decoding of Paper Mario's audio file formats, BGM (background music) and SBN (soundbank). BGM is for songs, while SBN is an archive format that holds all the rest of the audio files. There are other file types I'd like to support editing of in the future, specifically, BK (bank) and MSEQ (music sequence). BK holds actual sound samples, while MSEQ is similar to BGM but for the 'ambient sounds' in the game and - I think - sound effects. See [audio.h](https://github.com/pmret/papermario/blob/master/src/audio.h) for more info on these formats.

There are many doctests and unit tests in this crate. You can run them with `cargo test` after splitting a ROM with `python3 pm64/tests/bin/extract.py`.

**Architecture invariant:** `pm64` doesn't know about the filesystem, and doesn't know about the web; it's just a library for working with Paper Mario data. (The idea is to eventualy publish this crate to crates.io - if you are interested in using `pm64` in a different project, let me know and I can publish it!)

`mamar-wasm-bridge`
-------------------

This is some fairly trivial glue code that enables interesting parts of the `pm64` crate to be used by `mamar-web`. It uses [wasm-pack](https://rustwasm.github.io/wasm-pack/) for building, which is not part of the standard Rust toolchain.

`pm64-typegen`
--------------

`mamar-wasm-bridge` exported functions take and return the `any` type, but we can do more. This module provides TypeScript types for the main structs of the `pm64` crate, so that functions like `bgm_encode` can have their return values typed as `Bgm` which brings a better developer experience!

`n64crc`
--------

This is an emscripten port of n64sums, a tool for calculating the CRC checksum of N64 ROMs. It's unused currently but I'm keeping it around in case I need it in the future, for example for a 'save SBN to ROM' feature.

`patches`
---------

This module contains C functions that are compiled and linked with the Paper Mario decompilation, then the resulting binary for each function is converted to JS by a Python script. Also, RAM addresses for symbols from decomp are converted into JS too. The output is left in the repo because building requires the decomp toolchain, which can be a pain to set up.

This module is then used in `mamar-web`, functions in the emulator's console memory are overwritten with the custom code. Functions that compile to a bigger blob than the original are not patched, instead the original code is replaced with a stub that immediately calls a custom function placed in `0x8040000` memory space, which goes unused by the game. Data is also placed here, but it is not initialized because that would require more complex objdump parsing in the Python script.

Building
========

You'll need:

- [Node.js](https://nodejs.org/en/)
- [Yarn](https://yarnpkg.com/getting-started/install) (rather than npm)
- [Rust](https://rust-lang.org/tools/install)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)

In the root of this repo:
1. `yarn install`
2. `yarn workspace mamar-web build`

Output is at `mamar-web/dist`.

For developing, `yarn workspace mamar-web start` will start a dev server at `localhost:1234`. This server supports hot-reloading but beware of editing code that talks to the emulator as it is quite likely that you will experience crashes or other weirdness - reload the page to fix this.

Working on `mupen64plus-web`
----------------------------

- In [mupen64plus-web](https://github.com/bates64/mupen64plus-web):
    1. Switch the Mamar branch: `git checkout mamar`
    2. Run `yarn link`
    3. Setup emscripten 3.1.8
    4. Compile mupen64plus-web: `make -j config=release`
- In mamar:
    1. Run: `yarn link mupen64plus-web`
    2. Restart the dev server in `mamar-web`; you may need to clear the cache (`rm -rf .parcel-cache`)

Rebuilding `mamar-wasm-bridge` or `pm64`
----------------------------------------

In `mamar-wasm-bridge`, run `wasm-pack build -t web` to rebuild.

Deployment
==========

To release a new version:
1. Bump the version in `mamar-web`'s `package.json`
2. Update the changelog
3. Push with tag

Contributing
============

If you interested in contributing to Mamar, great! Check out the [open issues](https://github.com/bates64/mamar/issues) for something to do. If you have any questions, feel free to ask in [the `#mamar` channel](https://discord.gg/qWSxcTjktv). I'm also happy to help out people who are new to React or Rust but still want to contribute.

License
=======

Mamar is licensed under the [BSD Zero Clause License](https://opensource.org/licenses/0BSD). This is a very permissive license, and you can do whatever you want with the code. If you do use Mamar to make a mod or other project, I'd appreciate a mention somewhere, but it's not required.
