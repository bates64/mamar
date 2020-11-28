const path = require("path")
const HtmlPlugin = require("html-webpack-plugin")
const WasmPackPlugin = require("@wasm-tool/wasm-pack-plugin")
const MiniCssExtractPlugin = require("mini-css-extract-plugin")
const FaviconsWebpackPlugin = require("favicons-webpack-plugin")

const dist = path.resolve(__dirname, "dist")

module.exports = env => {
    const is_electron = env === "electron"
    const mode = is_electron ? "production" : env

    return {
        mode,
        entry: {
            entry: "./src/entry.js",
        },
        output: {
            path: dist,
            filename: "[name].js",
        },
        devServer: {
            contentBase: dist,
            overlay: true,
            stats: "errors-warnings",
        },
        plugins: [
            new HtmlPlugin({
                title: "Mamar",
                scriptLoading: "defer",
                hash: true,
            }),

            new FaviconsWebpackPlugin({
                logo: "../mamar.svg",
                prefix: "",
                favicons: {
                    appName: "Mamar",
                    appDescription: "Paper Mario music editor",
                    developerName: "Alex Bates",
                    developerURL: "https://imalex.xyz",
                    display: "fullscreen",
                    background: "#ea7aa1",
                    theme_color: "#ea7aa1",
                    version: require("./package.json").version,
                    icons: {
                        appleIcon: {
                            offset: 5,
                            background: "#fff",
                        },

                        appleStartup: false, // They're *huge*!

                        // Uncommon
                        firefox: false,
                        coast: false,
                        yandex: false,
                    },
                },
            }),

            new MiniCssExtractPlugin(),

            new WasmPackPlugin({
                crateDirectory: __dirname,
                forceMode: mode,
            }),
        ],
        module: {
            rules: [
                {
                    test: /\.css$/,
                    use: [MiniCssExtractPlugin.loader, "css-loader", "postcss-loader"],
                },
            ],
        },
        }
}
