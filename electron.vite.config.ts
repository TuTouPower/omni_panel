import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";

export default {
    main: {
        build: {
            rollupOptions: {
                external: ["esbuild"],
                input: {
                    index: resolve("src/main/index.ts"),
                    collector: resolve("src/main/core/token-stats/collector.ts"),
                },
            },
        },
    },
    preload: {
        build: {
            rollupOptions: {
                output: { entryFileNames: "index.js" },
            },
        },
    },
    renderer: {
        root: resolve("src/renderer"),
        build: {
            rollupOptions: {
                input: { index: resolve("src/renderer/index.html") },
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
    },
};
