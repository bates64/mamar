import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Builds the editor from mamar-web's source. Library mode inlines the
// WebAssembly bridge as a data URL, so the host's bundler needs no loader for it.
export default defineConfig({
    plugins: [react()],
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
