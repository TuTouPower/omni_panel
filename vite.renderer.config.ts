import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import path from "node:path";

export default defineConfig({
    plugins: [react()],
    css: {
        postcss: {
            plugins: [tailwindcss()],
        },
    },
    resolve: {
        alias: {
            "@": path.join(__dirname, "src/renderer"),
        },
    },
    build: {
        rollupOptions: {
            input: {
                index: path.join(__dirname, "src/renderer/index.html"),
            },
        },
    },
});
