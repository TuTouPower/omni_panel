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
        request: { endpoint: "default", path: "/v1/team/credit-usage", method: "GET" },
        map: {},
    },
    script: "connector.ts",
};

const CREDIT_PAYLOAD = {
    success: true,
    data: {
        remaining_credits: 800,
        plan_credits: 1000,
        billing_period_start: "2026-07-03T11:54:41.999Z",
        billing_period_end: "2026-08-03T11:54:41.999Z",
    },
};

const TOKEN_PAYLOAD = {
    success: true,
    data: {
        remaining_tokens: 12000,
        plan_tokens: 15000,
        billing_period_start: "2026-07-03T11:54:41.999Z",
        billing_period_end: "2026-08-03T11:54:41.999Z",
    },
};

const EXPECTED_RESET_AT = Date.parse("2026-08-03T11:54:41.999Z");

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
        report_failed_account: () => undefined,
    };
}

function create_ctx(
    credit_payload: unknown = CREDIT_PAYLOAD,
    token_payload: unknown = TOKEN_PAYLOAD,
    params: Record<string, string> = { API_KEY: "test-key" },
): ConnectorContext {
    const get_json = vi
        .fn<ConnectorContext["http"]["get_json"]>()
        .mockImplementation((endpoint_key, path, opts) => {
            expect(endpoint_key).toBe("default");
            expect(opts?.headers?.["Authorization"]).toBe("Bearer test-key");
            if (path === "/v1/team/credit-usage") return Promise.resolve(credit_payload);
            if (path === "/v1/team/token-usage") return Promise.resolve(token_payload);
            throw new Error(`unexpected path ${path}`);
        });

    return create_ctx_with_get_json(get_json, params);
}

async function read_connector_script() {
    return readFile(join("connectors", "firecrawl", "connector.ts"), "utf8");
}

async function run_firecrawl_with_ctx(ctx: ConnectorContext) {
    return run_connector(manifest, await read_connector_script(), ctx);
}

async function run_firecrawl(
    credit_payload?: unknown,
    token_payload?: unknown,
    params?: Record<string, string>,
) {
    return run_firecrawl_with_ctx(create_ctx(credit_payload, token_payload, params));
}

describe("firecrawl connector", () => {
    it("maps remaining/plan to used/limit for credits and tokens", async () => {
        const result = await run_firecrawl();

        expect(result.error).toBeNull();
        expect(result.observations.map((o) => o.metric_id)).toEqual([
            "firecrawl:credits-total",
            "firecrawl:tokens-total",
        ]);

        expect(result.observations[0]).toEqual(
            expect.objectContaining({
                provider: "firecrawl",
                account_id: "firecrawl",
                account_label: "Firecrawl",
                raw_label: "credits",
                normalized_label: "积分",
                used: 200,
                limit: 1000,
                reset_at: EXPECTED_RESET_AT,
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
                used: 3000,
                limit: 15000,
                reset_at: EXPECTED_RESET_AT,
            }),
        );
    });

    it("treats missing numeric fields as zero", async () => {
        const result = await run_firecrawl(
            { success: true, data: {} },
            { success: true, data: {} },
        );

        expect(result.error).toBeNull();
        expect(result.observations.map((o) => o.used)).toEqual([0, 0]);
        expect(result.observations.map((o) => o.limit)).toEqual([0, 0]);
        expect(result.observations.map((o) => o.reset_at)).toEqual([null, null]);
    });

    it("returns no observations when API key is missing", async () => {
        const get_json = vi
            .fn<ConnectorContext["http"]["get_json"]>()
            .mockResolvedValue(CREDIT_PAYLOAD);
        const ctx = create_ctx_with_get_json(get_json, { API_KEY: "" });

        const result = await run_firecrawl_with_ctx(ctx);

        expect(result.error).toBeNull();
        expect(result.observations).toEqual([]);
        expect(get_json).not.toHaveBeenCalled();
    });

    it("throws when API response is not an object", async () => {
        const result = await run_firecrawl(null, null);

        expect(result.error).not.toBeNull();
        expect(result.error).toContain("Firecrawl API 返回格式异常");
        expect(result.observations).toEqual([]);
    });

    it("throws when API reports success:false", async () => {
        const result = await run_firecrawl(
            { success: false, error: "invalid api key" },
            { success: false, error: "invalid api key" },
        );

        expect(result.error).not.toBeNull();
        expect(result.error).toContain("invalid api key");
    });
});
