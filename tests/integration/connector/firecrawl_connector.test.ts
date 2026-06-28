import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";

const manifest: Manifest = {
    id: "firecrawl",
    provider: "firecrawl",
    capabilities: ["poll"],
    parameters: [
        {
            name: "API_KEY",
            type: "secret",
            required: true,
            exposeToScript: true,
        },
    ],
    endpoints: { default: "https://api.firecrawl.dev" },
    poll: {
        request: { endpoint: "default", path: "/team/token-usage", method: "GET" },
        map: {},
    },
    script: "connector.ts",
};

function create_ctx_with_get_json(
    get_json: ConnectorContext["http"]["get_json"],
    params: Record<string, string>,
): ConnectorContext {
    return {
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        http: {
            get_json,
            post_json: () => Promise.resolve({}),
            get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
        },
        files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
        params,
    };
}

function create_ctx(
    payload: unknown,
    params: Record<string, string> = { API_KEY: "test-key" },
): ConnectorContext {
    const get_json = vi
        .fn<ConnectorContext["http"]["get_json"]>()
        .mockImplementation((endpoint_key, path, opts) => {
            expect(endpoint_key).toBe("default");
            expect(path).toBe("/team/token-usage");
            expect(opts?.headers?.["Authorization"]).toBe("Bearer test-key");
            return Promise.resolve(payload);
        });

    return create_ctx_with_get_json(get_json, params);
}

async function read_connector_script() {
    return readFile(join("connectors", "firecrawl", "connector.ts"), "utf8");
}

async function run_firecrawl_with_ctx(ctx: ConnectorContext) {
    return run_connector(manifest, await read_connector_script(), ctx);
}

async function run_firecrawl(payload: unknown, params?: Record<string, string>) {
    return run_firecrawl_with_ctx(create_ctx(payload, params));
}

describe("firecrawl connector", () => {
    it("maps credit and token usage to observations", async () => {
        const result = await run_firecrawl({ credits: 100, tokens: 1500 });

        expect(result.error).toBeNull();
        expect(result.observations.map((o) => o.metric_id)).toEqual([
            "firecrawl:credits-total",
            "firecrawl:tokens-total",
        ]);

        expect(result.observations[0]).toEqual(
            expect.objectContaining({
                provider: "firecrawl",
                source_instance_id: "firecrawl",
                account_id: "firecrawl",
                account_label: "Firecrawl",
                raw_label: "credits",
                normalized_label: "积分",
                used: 100,
                limit: null,
                window: "month",
                display_style: "ratio",
                status: "normal",
                source: "poll",
                stale: false,
                last_error: null,
            }),
        );

        expect(result.observations[1]).toEqual(
            expect.objectContaining({
                metric_id: "firecrawl:tokens-total",
                raw_label: "tokens",
                normalized_label: "Tokens",
                used: 1500,
                limit: null,
            }),
        );
    });

    it("treats missing numeric fields as zero", async () => {
        const result = await run_firecrawl({});

        expect(result.error).toBeNull();
        expect(result.observations.map((o) => o.used)).toEqual([0, 0]);
    });

    it("returns no observations when API key is missing", async () => {
        const get_json = vi.fn<ConnectorContext["http"]["get_json"]>().mockResolvedValue({
            credits: 100,
            tokens: 1500,
        });
        const ctx = create_ctx_with_get_json(get_json, { API_KEY: "" });

        const result = await run_firecrawl_with_ctx(ctx);

        expect(result.error).toBeNull();
        expect(result.observations).toEqual([]);
        expect(get_json).not.toHaveBeenCalled();
    });

    it("throws when API response is not an object", async () => {
        const result = await run_firecrawl(null);

        expect(result.error).not.toBeNull();
        expect(result.error).toContain("Firecrawl API 返回格式异常");
        expect(result.observations).toEqual([]);
    });
});
