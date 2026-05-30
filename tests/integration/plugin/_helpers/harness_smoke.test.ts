import { describe, it, expect, afterAll } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { runWithStubBackend } from "./with_stub_backend";
import { runBundledPlugin } from "./plugin_test_harness";

const CACHE_DIR = resolve(__dirname, "../../../../.cache/test-harness");

describe("test harness smoke", () => {
    it("runBundledPlugin can compile and run deepseek plugin (missing key → error)", async () => {
        const { parsed } = await runBundledPlugin({
            pluginFile: "deepseek-usage-plugin.ts",
            params: {},
        });
        expect(parsed.success).toBe(false);
    });

    it("runWithStubBackend injects stub URL via env", async () => {
        const { parsed, requests } = await runWithStubBackend({
            pluginFile: "deepseek-usage-plugin.ts",
            params: { API_KEY: "test-key" },
            routes: [
                {
                    path: /\/user\/balance/,
                    body: {
                        balance_infos: [{ currency: "CNY", total_balance: "50.00" }],
                    },
                },
            ],
        });
        expect(parsed.success).toBe(true);
        expect(requests.length).toBe(1);
    });

    afterAll(() => {
        if (existsSync(CACHE_DIR)) {
            rmSync(CACHE_DIR, { recursive: true, force: true });
        }
    });
});
