import path from "path"
import fs from "fs"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { viteStaticCopy } from "vite-plugin-static-copy"
import wasm from "vite-plugin-wasm"
import topLevelAwait from "vite-plugin-top-level-await"
import chokidar from "chokidar"

const serveMupenAssets = () => ({
    name: "serve-mupen64plus-web",
    configureServer(server: import("vite").ViteDevServer) {
        server.middlewares.use((req, res, next) => {
            const url = req.url || ""
            if (!url.startsWith("/mupen64plus-web/")) return next()

            const relativePath = url.replace("/mupen64plus-web/", "")
            const filePath = path.resolve(__dirname, "../node_modules/mupen64plus-web/bin/web", relativePath)

            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                res.setHeader("Access-Control-Allow-Origin", "*")
                fs.createReadStream(filePath).pipe(res)
                return
            }

            return next()
        })
    },
})

const wasmHotReload = () => ({
    name: "wasm-hot-reload",
    configureServer(server: import("vite").ViteDevServer) {
        const pkgDir = path.resolve(__dirname, "../mamar-wasm-bridge/pkg")
        const watcher = chokidar.watch(pkgDir, { ignoreInitial: true })
        watcher.on("all", (_event, filePath) => {
            if (!filePath.endsWith(".wasm") && !filePath.endsWith(".js")) return
            server.ws.send({ type: "full-reload" })
        })
        server.httpServer?.on("close", () => watcher.close())
    },
})

export default defineConfig({
    root: path.resolve(__dirname, "src"),
    plugins: [
        react(),
        wasm(),
        topLevelAwait(),
        wasmHotReload(),
        serveMupenAssets(),
        viteStaticCopy({
            targets: [
                {
                    src: path.resolve(__dirname, "../node_modules/mupen64plus-web/bin/web"),
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
        headers: {
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp",
        },
    },
})
