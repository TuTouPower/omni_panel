import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";

/**
 * Standalone web build — produces a browser-loadable SPA in out/web/ that
 * talks to the desktop app's local-api over HTTP. Reuses the renderer App +
 * components; the only difference is the entry installs the web usageboard
 * bridge instead of relying on preload.
 */
export default {
    root: resolve("src/web"),
    base: "./",
    build: {
        outDir: resolve("out/web"),
        emptyOutDir: true,
        rollupOptions: {
            input: { index: resolve("src/web/index.html") },
        },
    },
    plugins: [react()],
    resolve: {
        alias: { "@": resolve("src/renderer") },
    },
    css: {
        postcss: {
            plugins: [tailwindcss()],
        },
    },
};
