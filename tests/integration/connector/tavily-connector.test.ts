import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";

const manifest: Manifest = {
    id: "tavily",
    provider: "tavily",
    capabilities: ["poll"],
    parameters: [
        {
            name: "API_KEY",
            type: "secret",
            required: true,
            exposeToScript: true,
        },
    ],
    endpoints: { default: "https://api.tavily.com" },
    poll: {
        request: { endpoint: "default", path: "/usage", method: "GET" },
        map: {},
    },
    script: "connector.ts",
};

function create_ctx(account: unknown): ConnectorContext {
    return {
        http: {
            get_json(endpoint_key, path, opts) {
                expect(endpoint_key).toBe("default");
                expect(path).toBe("/usage");
                expect(opts?.headers?.["Authorization"]).toBe("Bearer test-key");
                return Promise.resolve({ account });
            },
            post_json: () => Promise.resolve({}),
            get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
        },
        files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
        params: { API_KEY: "test-key" },
    };
}

describe("tavily connector", () => {
    it("maps plan usage and detail items to observations", async () => {
        const script = await readFile(join("connectors", "tavily", "connector.ts"), "utf8");
        const result = await run_connector(
            manifest,
            script,
            create_ctx({
                plan_limit: "1000",
                plan_usage: "400",
                search_usage: "300",
                crawl_usage: "0",
                extract_usage: "100",
                map_usage: "0",
                research_usage: "0",
            }),
        );

        expect(result.error).toBeNull();
        const ids = result.observations.map((o) => o.metric_id);
        expect(ids).toEqual(["tavily:total-month", "tavily:search", "tavily:extract"]);

        const total = result.observations[0];
        expect(total).toEqual(
            expect.objectContaining({
                provider: "tavily",
                used: 400,
                limit: 1000,
                display_style: "ratio",
                status: "normal",
            }),
        );
        expect(total?.reset_at).not.toBeNull();
        expect(total?.window).toBe("month");

        const search = result.observations[1];
        expect(search).toEqual(
            expect.objectContaining({
                metric_id: "tavily:search",
                raw_label: "search",
                normalized_label: "搜索",
                used: 300,
                limit: 1000,
            }),
        );
    });

    it("returns critical status when usage exceeds 90% of limit", async () => {
        const script = await readFile(join("connectors", "tavily", "connector.ts"), "utf8");
        const result = await run_connector(
            manifest,
            script,
            create_ctx({ plan_limit: "100", plan_usage: "95" }),
        );

        expect(result.observations[0]?.status).toBe("critical");
    });

    it("throws error when plan_limit is zero or negative", async () => {
        const script = await readFile(join("connectors", "tavily", "connector.ts"), "utf8");
        const result = await run_connector(
            manifest,
            script,
            create_ctx({ plan_limit: "0", plan_usage: "10" }),
        );

        expect(result.error).not.toBeNull();
        expect(result.error).toContain("plan limit is 0 or negative");
        expect(result.observations).toEqual([]);
    });

    it("throws when API returns error field", async () => {
        const script = await readFile(join("connectors", "tavily", "connector.ts"), "utf8");
        const ctx: ConnectorContext = {
            http: {
                get_json: () => Promise.resolve({ error: "Invalid API key" }),
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
            files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
            params: { API_KEY: "test-key" },
        };
        const result = await run_connector(manifest, script, ctx);

        expect(result.error).not.toBeNull();
        expect(result.error).toContain("Invalid API key");
        expect(result.observations).toEqual([]);
    });

    it("throws when API response lacks account", async () => {
        const script = await readFile(join("connectors", "tavily", "connector.ts"), "utf8");
        const ctx: ConnectorContext = {
            http: {
                get_json: () => Promise.resolve({}),
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
            files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
            params: { API_KEY: "test-key" },
        };
        const result = await run_connector(manifest, script, ctx);

        expect(result.error).not.toBeNull();
        expect(result.error).toContain("account");
        expect(result.observations).toEqual([]);
    });
});
