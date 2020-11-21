const path = require("path")
const CopyPlugin = require("copy-webpack-plugin")
const WasmPackPlugin = require("@wasm-tool/wasm-pack-plugin")

const dist = path.resolve(__dirname, "dist")

module.exports = env => ({
    mode: env,
    entry: {
        index: "./src/index.js",
    },
    output: {
        path: dist,
        filename: "[name].js",
    },
    devServer: {
        contentBase: dist,
        overlay: true,
        stats: 'errors-warnings',
    },
    plugins: [
        new CopyPlugin([
            path.resolve(__dirname, "static"),
        ]),

        new WasmPackPlugin({
            crateDirectory: __dirname,
            forceMode: env,
        }),
    ]
})
