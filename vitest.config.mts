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
        exclude: ["**/contract_live/**"],
        globals: true,
        css: false,
        projects: [
            {
                test: {
                    name: "renderer",
                    include: [
                        "tests/unit/renderer/**/*.test.{ts,tsx}",
                        "tests/smoke/**/*.test.{ts,tsx}",
                        "tests/unit/web/**/*.test.{ts,tsx}",
                    ],
                    globals: true,
                    environment: "jsdom",
                    setupFiles: ["./tests/smoke/setup.ts"],
                },
            },
            {
                test: {
                    name: "node",
                    include: [
                        "tests/unit/main/**/*.test.{ts,tsx}",
                        "tests/unit/ipc/**/*.test.{ts,tsx}",
                        "tests/unit/local-api/**/*.test.{ts,tsx}",
                        "tests/unit/shared/**/*.test.{ts,tsx}",
                        "tests/unit/scheduler/**/*.test.{ts,tsx}",
                        "tests/unit/connector/**/*.test.{ts,tsx}",
                        "tests/unit/auth/**/*.test.{ts,tsx}",
                        "tests/unit/config/**/*.test.{ts,tsx}",
                        "tests/unit/core/**/*.test.{ts,tsx}",
                        "tests/unit/network/**/*.test.{ts,tsx}",
                        "tests/unit/preload/**/*.test.{ts,tsx}",
                        "tests/unit/session/**/*.test.{ts,tsx}",
                        "tests/unit/schemas/**/*.test.{ts,tsx}",
                        "tests/unit/e2e/**/*.test.{ts,tsx}",
                        "tests/unit/*.test.{ts,tsx}",
                        "tests/integration/**/*.test.{ts,tsx}",
                    ],
                    globals: true,
                    environment: "node",
                },
            },
        ],
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
