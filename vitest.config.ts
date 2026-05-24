import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.join(__dirname, "src/renderer"),
        },
    },
    test: {
        include: ["tests/**/*.test.{ts,tsx}"],
        globals: true,
        environment: "jsdom",
        setupFiles: ["./tests/smoke/setup.ts"],
        css: false,
    },
});
