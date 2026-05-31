import { describe, it, expect } from "vitest";
import { runWithStubBackend } from "./_helpers/with_stub_backend";
import { runBundledPlugin } from "./_helpers/plugin_test_harness";

describe("tavily-usage-plugin", () => {
    const success_body = {
        account: {
            plan_limit: 1000,
            plan_usage: 500,
            search_usage: 200,
            crawl_usage: 100,
            extract_usage: 50,
            map_usage: 30,
            research_usage: 20,
        },
    };

    it("returns usage items on success", async () => {
        const { parsed, requests } = await runWithStubBackend({
            pluginFile: "tavily-usage-plugin.ts",
            params: { API_KEY: "tvly-test-key" },
            routes: [{ path: "/usage", body: success_body }],
        });
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.items.length).toBeGreaterThan(0);
            expect(parsed.items[0]?.used).toBe(500);
            expect(parsed.items[0]?.limit).toBe(1000);
        }
        expect(requests.length).toBe(1);
        expect(requests[0]?.headers["authorization"]).toContain("tvly-test-key");
    });

    it("returns MISSING_PARAM when API_KEY is missing", async () => {
        const { parsed } = await runBundledPlugin({
            pluginFile: "tavily-usage-plugin.ts",
            params: {},
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) expect(parsed.error.code).toBe("MISSING_PARAM");
    });

    it("returns HTTP_401 on unauthorized", async () => {
        const { parsed } = await runWithStubBackend({
            pluginFile: "tavily-usage-plugin.ts",
            params: { API_KEY: "bad-key" },
            routes: [{ path: "/usage", status: 401, body: { error: "unauthorized" } }],
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) expect(parsed.error.code).toBe("HTTP_401");
    });

    it("returns HTTP_429 on rate limit", async () => {
        const { parsed } = await runWithStubBackend({
            pluginFile: "tavily-usage-plugin.ts",
            params: { API_KEY: "tvly-test-key" },
            routes: [{ path: "/usage", status: 429, body: { error: "rate limited" } }],
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) expect(parsed.error.code).toBe("HTTP_429");
    });

    it("returns HTTP_500 on server error", async () => {
        const { parsed } = await runWithStubBackend({
            pluginFile: "tavily-usage-plugin.ts",
            params: { API_KEY: "tvly-test-key" },
            routes: [{ path: "/usage", status: 500, body: { error: "internal" } }],
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) expect(parsed.error.code).toBe("HTTP_500");
    });

    it("returns TIMEOUT on slow response", { timeout: 20_000 }, async () => {
        const { parsed } = await runWithStubBackend({
            pluginFile: "tavily-usage-plugin.ts",
            params: { API_KEY: "tvly-test-key" },
            timeoutMs: 20_000,
            routes: [{ path: "/usage", delayMs: 12_000, body: {} }],
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) expect(parsed.error.code).toBe("TIMEOUT");
    });
});
