import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.join(__dirname, "src/renderer"),
            "@omni-usage/plugin-sdk": path.join(__dirname, "src/plugins/sdk/index.ts"),
        },
    },
    test: {
        include: ["tests/**/*.test.{ts,tsx}"],
        exclude: ["**/contract_live/**"],
        globals: true,
        environment: "jsdom",
        setupFiles: ["./tests/smoke/setup.ts"],
        css: false,
        coverage: {
            provider: "v8",
            reporter: ["text", "html", "json-summary"],
            include: ["src/**/*.{ts,tsx}"],
            exclude: [
                "src/**/*.d.ts",
                "src/renderer/main.tsx",
                "src/preload/**",
                "**/*.test.{ts,tsx}",
            ],
            thresholds: {
                statements: 15,
                branches: 25,
                functions: 25,
                lines: 15,
            },
        },
    },
});
