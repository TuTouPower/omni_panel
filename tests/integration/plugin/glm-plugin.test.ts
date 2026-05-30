import { describe, it, expect } from "vitest";
import { withHttpStub } from "./_helpers/http_stub";
import type { HttpStubRoute } from "./_helpers/http_stub";
import { runBundledPlugin } from "./_helpers/plugin_test_harness";

const PLUGIN = "glm-usage-plugin.ts";

function quota_response(): unknown {
    return {
        data: {
            limits: [
                {
                    unit: 3,
                    number: 5,
                    percentage: 30,
                    nextResetTime: "2026-06-01T00:00:00Z",
                },
                {
                    unit: 6,
                    number: 1,
                    percentage: 60,
                    nextResetTime: "2026-06-08T00:00:00Z",
                },
            ],
        },
    };
}

function empty_model_usage(): unknown {
    return { data: {} };
}

function run_glm(
    routes: HttpStubRoute[],
    params: Record<string, string> = { API_KEY: "test-key" },
    env_override?: Record<string, string>,
) {
    return withHttpStub(routes, async (handle) => {
        const env = {
            OMNI_PLUGIN_ENDPOINTS: JSON.stringify({
                default: handle.baseUrl,
                model_usage: handle.baseUrl,
            }),
            USAGEBOARD_CACHE_DIR: handle.baseUrl, // prevent real cache writes
            ...env_override,
        };
        return runBundledPlugin({
            pluginFile: PLUGIN,
            params,
            env,
        });
    });
}

describe("GLM plugin subprocess", () => {
    it("returns success with items on valid quota response", async () => {
        const routes: HttpStubRoute[] = [
            { path: "/api/monitor/usage/quota/limit", body: quota_response() },
            { path: /\/api\/monitor\/usage\/model-usage/, body: empty_model_usage() },
        ];
        const { parsed } = await run_glm(routes);

        expect(parsed.success).toBe(true);
        if (!parsed.success) return;

        expect(parsed.items.length).toBeGreaterThan(0);
        expect(parsed.items.every((item) => item.id.startsWith("glm-"))).toBe(true);
        expect(parsed.chart).toBeDefined();
    });

    it("returns MISSING_PARAM when API_KEY is missing", async () => {
        const routes: HttpStubRoute[] = [
            { path: "/api/monitor/usage/quota/limit", body: quota_response() },
        ];
        const { parsed } = await run_glm(routes, {});

        expect(parsed.success).toBe(false);
        if (parsed.success) return;

        expect(parsed.error.code).toBe("MISSING_PARAM");
    });

    it("returns HTTP_401 on unauthorized response", async () => {
        const routes: HttpStubRoute[] = [
            {
                path: "/api/monitor/usage/quota/limit",
                status: 401,
                body: { error: "unauthorized" },
            },
        ];
        const { parsed } = await run_glm(routes);

        expect(parsed.success).toBe(false);
        if (parsed.success) return;

        expect(parsed.error.code).toBe("HTTP_401");
    });

    it("returns HTTP_429 on rate limit response", async () => {
        const routes: HttpStubRoute[] = [
            {
                path: "/api/monitor/usage/quota/limit",
                status: 429,
                body: { error: "rate limited" },
            },
        ];
        const { parsed } = await run_glm(routes);

        expect(parsed.success).toBe(false);
        if (parsed.success) return;

        expect(parsed.error.code).toBe("HTTP_429");
    });

    it("returns HTTP_500 on server error", async () => {
        const routes: HttpStubRoute[] = [
            { path: "/api/monitor/usage/quota/limit", status: 500, body: { error: "internal" } },
        ];
        const { parsed } = await run_glm(routes);

        expect(parsed.success).toBe(false);
        if (parsed.success) return;

        expect(parsed.error.code).toBe("HTTP_500");
    });

    it("returns TIMEOUT error when request takes too long", { timeout: 20000 }, async () => {
        const routes: HttpStubRoute[] = [
            { path: "/api/monitor/usage/quota/limit", body: quota_response(), delayMs: 12000 },
        ];
        const { parsed } = await run_glm(routes, { API_KEY: "test-key" }, {});

        expect(parsed.success).toBe(false);
        if (parsed.success) return;

        expect(parsed.error.code).toBe("TIMEOUT");
    });
});
