import { describe, it, expect } from "vitest";
import { runWithStubBackend } from "./_helpers/with_stub_backend";
import { runBundledPlugin } from "./_helpers/plugin_test_harness";

describe("deepseek-usage-plugin", () => {
    it("returns balance items on success", async () => {
        const { parsed, requests } = await runWithStubBackend({
            pluginFile: "deepseek-usage-plugin.ts",
            params: { API_KEY: "sk-test" },
            routes: [
                {
                    path: "/user/balance",
                    body: { balance_infos: [{ currency: "CNY", total_balance: "50.00" }] },
                },
            ],
        });
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.items.length).toBeGreaterThan(0);
            expect(parsed.items[0]?.used).toBe(50);
        }
        expect(requests.length).toBe(1);
        expect(requests[0]?.headers["authorization"]).toContain("sk-test");
    });

    it("returns MISSING_PARAM when API_KEY is missing", async () => {
        const { parsed } = await runBundledPlugin({
            pluginFile: "deepseek-usage-plugin.ts",
            params: {},
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) expect(parsed.error.code).toBe("MISSING_PARAM");
    });

    it("returns HTTP_401 on unauthorized", async () => {
        const { parsed } = await runWithStubBackend({
            pluginFile: "deepseek-usage-plugin.ts",
            params: { API_KEY: "bad-key" },
            routes: [{ path: "/user/balance", status: 401, body: { error: "unauthorized" } }],
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) expect(parsed.error.code).toBe("HTTP_401");
    });

    it("returns HTTP_429 on rate limit", async () => {
        const { parsed } = await runWithStubBackend({
            pluginFile: "deepseek-usage-plugin.ts",
            params: { API_KEY: "sk-test" },
            routes: [{ path: "/user/balance", status: 429, body: { error: "rate limited" } }],
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) expect(parsed.error.code).toBe("HTTP_429");
    });

    it("returns HTTP_500 on server error", async () => {
        const { parsed } = await runWithStubBackend({
            pluginFile: "deepseek-usage-plugin.ts",
            params: { API_KEY: "sk-test" },
            routes: [{ path: "/user/balance", status: 500, body: { error: "internal" } }],
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) expect(parsed.error.code).toBe("HTTP_500");
    });

    it("returns TIMEOUT on slow response", { timeout: 20_000 }, async () => {
        const { parsed } = await runWithStubBackend({
            pluginFile: "deepseek-usage-plugin.ts",
            params: { API_KEY: "sk-test" },
            timeoutMs: 20_000,
            routes: [{ path: "/user/balance", delayMs: 12_000, body: {} }],
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) expect(parsed.error.code).toBe("TIMEOUT");
    });
});
