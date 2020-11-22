const path = require('path')
const HtmlPlugin = require('html-webpack-plugin')
const WasmPackPlugin = require('@wasm-tool/wasm-pack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')

const dist = path.resolve(__dirname, 'dist')

module.exports = env => ({
    mode: env,
    entry: {
        entry: './src/entry.js',
    },
    output: {
        path: dist,
        filename: '[name].js',
    },
    devServer: {
        contentBase: dist,
        overlay: true,
        stats: 'errors-warnings',
    },
    plugins: [
        new HtmlPlugin({
            title: 'BGM Editor',
            scriptLoading: 'defer',
            hash: true,
        }),

        new MiniCssExtractPlugin(),

        new WasmPackPlugin({
            crateDirectory: __dirname,
            forceMode: env,
        }),
    ],
    module: {
        rules: [
            {
                test: /\.css$/,
                use: [MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader'],
            },
        ],
    },
})
