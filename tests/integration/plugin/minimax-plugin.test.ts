import { describe, it, expect } from "vitest";
import { runWithStubBackend } from "./_helpers/with_stub_backend";
import { runBundledPlugin } from "./_helpers/plugin_test_harness";

describe("minimax-usage-plugin", () => {
    const success_body = {
        base_resp: { status_code: 0 },
        model_remains: [
            {
                model_name: "MiniMax-M*",
                start_time: 1000,
                end_time: 19000000,
                current_interval_total_count: 100,
                current_interval_usage_count: 30,
                remains_time: 3600000,
            },
        ],
    };

    it("returns usage items on success", async () => {
        const { parsed, requests } = await runWithStubBackend({
            pluginFile: "minimax-usage-plugin.ts",
            params: { API_KEY: "mm-test-key" },
            env: { OMNI_SOURCE_INSTANCE_ID: "minimax-api-test" },
            routes: [{ path: "/v1/token_plan/remains", body: success_body }],
        });
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.schemaVersion).toBe(2);
            expect(parsed.items.length).toBeGreaterThan(0);
            expect(parsed.items[0]).toEqual(
                expect.objectContaining({
                    provider: "minimax",
                    source: "api_key",
                    sourceInstanceId: "minimax-api-test",
                    accountId: "minimax-api-test",
                    accountLabel: "MiniMax",
                    used: 30,
                    limit: 100,
                }),
            );
            expect(parsed.badge).toBeDefined();
        }
        expect(requests.length).toBe(1);
        expect(requests[0]?.headers["authorization"]).toContain("mm-test-key");
    });

    it("returns MISSING_PARAM when API_KEY is missing", async () => {
        const { parsed } = await runBundledPlugin({
            pluginFile: "minimax-usage-plugin.ts",
            params: {},
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) expect(parsed.error.code).toBe("MISSING_PARAM");
    });

    it("returns HTTP_401 on base_resp status_code 2049", async () => {
        const { parsed } = await runWithStubBackend({
            pluginFile: "minimax-usage-plugin.ts",
            params: { API_KEY: "mm-test-key" },
            routes: [
                {
                    path: "/v1/token_plan/remains",
                    body: {
                        base_resp: { status_code: 2049, status_msg: "auth error" },
                        model_remains: [],
                    },
                },
            ],
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) expect(parsed.error.code).toBe("HTTP_401");
    });

    it("returns error on non-zero status_code", async () => {
        const { parsed } = await runWithStubBackend({
            pluginFile: "minimax-usage-plugin.ts",
            params: { API_KEY: "mm-test-key" },
            routes: [
                {
                    path: "/v1/token_plan/remains",
                    body: {
                        base_resp: { status_code: 1001, status_msg: "some error" },
                        model_remains: [],
                    },
                },
            ],
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) expect(parsed.error.code).toMatch(/^HTTP_/);
    });

    it("returns error on missing model_remains", async () => {
        const { parsed } = await runWithStubBackend({
            pluginFile: "minimax-usage-plugin.ts",
            params: { API_KEY: "mm-test-key" },
            routes: [
                {
                    path: "/v1/token_plan/remains",
                    body: { base_resp: { status_code: 0 } },
                },
            ],
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) expect(parsed.error.code).toBe("INVALID_RESPONSE");
    });

    it("returns TIMEOUT on slow response", { timeout: 20_000 }, async () => {
        const { parsed } = await runWithStubBackend({
            pluginFile: "minimax-usage-plugin.ts",
            params: { API_KEY: "mm-test-key" },
            timeoutMs: 20_000,
            routes: [{ path: "/v1/token_plan/remains", delayMs: 12_000, body: {} }],
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) expect(parsed.error.code).toBe("TIMEOUT");
    });
});
