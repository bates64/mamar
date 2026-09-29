import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import wasm from "vite-plugin-wasm"
import topLevelAwait from "vite-plugin-top-level-await"

export default defineConfig({
    root: path.resolve(__dirname, "src"),
    plugins: [
        react(),
        wasm(),
        topLevelAwait(),
    ],
    build: {
        outDir: path.resolve(__dirname, "dist"),
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, "src/index.html"),
                app: path.resolve(__dirname, "src/app/index.html"),
            },
        },
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
        },
    },
    server: {
        fs: {
            allow: [
                path.resolve(__dirname),
                path.resolve(__dirname, "../mamar-wasm-bridge/pkg"),
                path.resolve(__dirname, "../mamar-audio/build"),
            ],
        },
    },
    worker: {
        format: "es",
    },
})
