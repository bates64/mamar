Run: `yarn build`

# Working on `mupen64plus-web`

- In [mupen64plus-web](https://github.com/nanaian/mupen64plus-web):
    - Run `yarn link`
    - Setup emscripten 3.1.8 (alex: run `emsdk_env`)
    - Compile mupen64plus-web: `make -j config=release`
- In mamar:
    - Run: `yarn link mupen64plus-web`
    - After compiling: `yarn start`
