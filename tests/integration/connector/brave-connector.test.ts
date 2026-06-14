import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";

const manifest: Manifest = {
    id: "brave",
    provider: "brave",
    capabilities: ["observe"],
    parameters: [
        {
            name: "API_KEY",
            type: "secret",
            required: true,
            exposeToScript: true,
        },
    ],
    endpoints: { default: "https://api.search.brave.com" },
    observe: {
        headers: ["x-ratelimit-limit", "x-ratelimit-remaining"],
        probe: {
            endpoint: "default",
            path: "/res/v1/web/search?q=test&count=1",
        },
    },
    script: "connector.ts",
};

function create_ctx(headers: Record<string, string>, api_key = "test-key"): ConnectorContext {
    return {
        http: {
            get_json: () => Promise.resolve({}),
            post_json: () => Promise.resolve({}),
            get_raw(endpoint_key, path, opts) {
                expect(endpoint_key).toBe("default");
                expect(path).toBe("/res/v1/web/search?q=test&count=1");
                expect(opts?.headers?.["X-Subscription-Token"]).toBe(api_key);
                return Promise.resolve({
                    status: 200,
                    headers,
                    body: JSON.stringify({ web: { results: [] } }),
                });
            },
        },
        files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
        params: { API_KEY: api_key },
    };
}

describe("brave connector", () => {
    it("maps rate limit headers to observation with used = limit - remaining", async () => {
        const script = await readFile(join("connectors", "brave", "connector.ts"), "utf8");
        const result = await run_connector(
            manifest,
            script,
            create_ctx({
                "x-ratelimit-limit": "2000",
                "x-ratelimit-remaining": "1500",
            }),
        );

        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(1);

        const obs = result.observations[0];
        expect(obs).toBeDefined();
        if (!obs) return;
        expect(obs).toEqual(
            expect.objectContaining({
                provider: "brave",
                source_instance_id: "brave",
                account_id: "brave",
                account_label: "Brave Search",
                metric_id: "brave:monthly-queries",
                name: "本月查询",
                window: "month",
                used: 500,
                limit: 2000,
                display_style: "ratio",
                source: "probe",
                stale: false,
                last_error: null,
            }),
        );
        expect(obs.reset_at).not.toBeNull();
        expect(obs.observed_at).toBeGreaterThan(0);
    });

    it("returns critical status when usage exceeds 90% of limit", async () => {
        const script = await readFile(join("connectors", "brave", "connector.ts"), "utf8");
        const result = await run_connector(
            manifest,
            script,
            create_ctx({
                "x-ratelimit-limit": "2000",
                "x-ratelimit-remaining": "100",
            }),
        );

        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(1);
        const obs = result.observations[0];
        expect(obs).toBeDefined();
        if (!obs) return;
        expect(obs.used).toBe(1900);
        expect(obs.status).toBe("critical");
    });

    it("returns warning status when usage exceeds 75% of limit", async () => {
        const script = await readFile(join("connectors", "brave", "connector.ts"), "utf8");
        const result = await run_connector(
            manifest,
            script,
            create_ctx({
                "x-ratelimit-limit": "2000",
                "x-ratelimit-remaining": "400",
            }),
        );

        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(1);
        const obs2 = result.observations[0];
        expect(obs2).toBeDefined();
        if (!obs2) return;
        expect(obs2.used).toBe(1600);
        expect(obs2.status).toBe("warning");
    });

    it("returns empty when API key is missing", async () => {
        const script = await readFile(join("connectors", "brave", "connector.ts"), "utf8");
        const result = await run_connector(
            manifest,
            script,
            create_ctx(
                {
                    "x-ratelimit-limit": "2000",
                    "x-ratelimit-remaining": "1500",
                },
                "",
            ),
        );

        expect(result.error).toBeNull();
        expect(result.observations).toEqual([]);
    });

    it("returns empty when rate limit headers are missing", async () => {
        const script = await readFile(join("connectors", "brave", "connector.ts"), "utf8");
        const result = await run_connector(
            manifest,
            script,
            create_ctx({ "content-type": "application/json" }),
        );

        expect(result.error).toBeNull();
        expect(result.observations).toEqual([]);
    });
});
