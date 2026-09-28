import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { viteStaticCopy } from "vite-plugin-static-copy"
import wasm from "vite-plugin-wasm"
import topLevelAwait from "vite-plugin-top-level-await"

export default defineConfig({
    root: path.resolve(__dirname, "src"),
    plugins: [
        react(),
        wasm(),
        topLevelAwait(),
        viteStaticCopy({
            targets: [
                {
                    src: path.resolve(__dirname, "../node_modules/mupen64plus-web/bin/web/*"),
                    dest: "mupen64plus-web",
                },
            ],
        }),
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
        // papermario-dx's CI publishes the patch and symbols the app plays songs with here. ../vercel.json does the same
        // in production, so the app fetches them from its own origin.
        proxy: {
            "/dx": {
                target: "https://fsn1.your-objectstorage.com",
                changeOrigin: true,
                rewrite: path => path.replace(/^\/dx/, "/starhaven/mamar"),
            },
        },
        headers: {
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp",
        },
        fs: {
            allow: [
                path.resolve(__dirname),
                path.resolve(__dirname, "../node_modules/mupen64plus-web/bin/web"),
                path.resolve(__dirname, "../mamar-wasm-bridge/pkg"),
            ],
        },
    },
    worker: {
        format: "es",
    },
})
