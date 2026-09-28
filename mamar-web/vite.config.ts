import { execFile } from "child_process"
import { readFile } from "fs/promises"
import path from "path"
import { promisify } from "util"
import { defineConfig, Plugin } from "vite"
import react from "@vitejs/plugin-react"
import { viteStaticCopy } from "vite-plugin-static-copy"
import wasm from "vite-plugin-wasm"
import topLevelAwait from "vite-plugin-top-level-await"

/**
 * Serves /dx from the papermario-dx clone at `dxDir` instead of papermario-dx's CI. Each request for symbols.json builds
 * the clone first, so reloading the app picks up changes to it.
 */
function localDx(dxDir: string): Plugin {
    const buildDir = path.join(dxDir, "ver/us/build")
    let build: Promise<void> | undefined
    let isBuilding = false

    function startBuild() {
        if (!isBuilding) {
            isBuilding = true
            build = promisify(execFile)("nix", [
                "develop", "--command", "sh", "-c",
                "ninja ver/us/build/papermario.bps && " +
                "python3 tools/mamar_symbols.py ver/us/build/papermario.elf ver/us/build/papermario.bps ver/us/build/mamar_symbols.json",
            ], { cwd: dxDir, maxBuffer: 64 * 1024 * 1024 }).then(() => {}).finally(() => {
                isBuilding = false
            })
        }
        return build!
    }

    return {
        name: "local-dx",
        configureServer(server) {
            server.middlewares.use("/dx", async (req, res) => {
                try {
                    if (req.url === "/symbols.json") {
                        await startBuild()
                        res.setHeader("Content-Type", "application/json")
                        res.end(await readFile(path.join(buildDir, "mamar_symbols.json")))
                    } else if (req.url === "/papermario.bps") {
                        await (build ?? startBuild())
                        res.end(await readFile(path.join(buildDir, "papermario.bps")))
                    } else {
                        res.statusCode = 404
                        res.end()
                    }
                } catch (error) {
                    const { stdout = "", stderr = "" } = error as { stdout?: string, stderr?: string }
                    server.config.logger.error(`Couldn't build papermario-dx in ${dxDir}: ${error}\n${stdout}${stderr}`)
                    res.statusCode = 500
                    res.end()
                }
            })
        },
    }
}

// Relative to the repository's root.
const dxDir = process.env.DX_DIR && path.resolve(__dirname, "..", process.env.DX_DIR)

export default defineConfig({
    root: path.resolve(__dirname, "src"),
    plugins: [
        react(),
        wasm(),
        topLevelAwait(),
        dxDir && localDx(dxDir),
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
        // in production, so the app fetches them from its own origin. With DX_DIR set, localDx serves them instead.
        proxy: dxDir ? undefined : {
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
