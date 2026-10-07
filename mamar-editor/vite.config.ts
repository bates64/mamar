import path from "path"
import react from "@vitejs/plugin-react"
import { build } from "esbuild"
import { defineConfig, Plugin } from "vite"

const WORKLET_URL = "\0audio-engine-worklet-url"

/**
 * Builds the audio engine's worklet into the library as a blob URL. A worklet
 * otherwise loads from a file beside the library, which the host's bundler
 * would have to know to copy and serve.
 */
function inlineWorklet(): Plugin {
    return {
        name: "inline-worklet",
        enforce: "pre",
        resolveId(source) {
            if (source.endsWith("/audioEngine.worklet?worker&url")) {
                return WORKLET_URL
            }
        },
        async load(id) {
            if (id !== WORKLET_URL) {
                return
            }
            const result = await build({
                entryPoints: [path.resolve(__dirname, "../mamar-web/src/app/emu/audioEngine.worklet.ts")],
                bundle: true,
                format: "esm",
                minify: true,
                write: false,
            })
            const code = JSON.stringify(result.outputFiles[0].text)
            return `export default URL.createObjectURL(new Blob([${code}], { type: "text/javascript" }))`
        },
    }
}

// Builds the editor from mamar-web's source. Library mode inlines the
// WebAssembly as data URLs, so the host's bundler needs no loader for it.
export default defineConfig({
    plugins: [react(), inlineWorklet()],
    // Library mode leaves this for the host's bundler, which might not define it.
    define: {
        "process.env.NODE_ENV": JSON.stringify("production"),
    },
    build: {
        outDir: path.resolve(__dirname, "dist"),
        emptyOutDir: true,
        lib: {
            entry: path.resolve(__dirname, "../mamar-web/src/app/lib.ts"),
            formats: ["es"],
            fileName: "mamar-editor",
            cssFileName: "mamar-editor",
        },
        rollupOptions: {
            // The host's React, so hooks work across the boundary.
            external: /^react(-dom)?(\/.*)?$/,
            output: {
                inlineDynamicImports: true,
            },
        },
    },
})
