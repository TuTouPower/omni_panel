import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
    resolve: {
        alias: {
            "@": path.join(__dirname, "src/renderer"),
        },
    },
    test: {
        include: ["tests/contract_live/**/*.test.{ts,tsx}"],
        globals: true,
        environment: "node",
    },
});
