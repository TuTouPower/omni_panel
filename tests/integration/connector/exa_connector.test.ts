import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";

const manifest: Manifest = {
    id: "exa",
    provider: "exa",
    capabilities: ["poll"],
    parameters: [
        { name: "SERVICE_KEY", type: "secret", required: true, exposeToScript: true },
        { name: "API_KEY_ID", type: "string", required: true, exposeToScript: true },
        { name: "LIMIT", type: "number", required: false, exposeToScript: true },
    ],
    endpoints: { default: "https://admin-api.exa.ai" },
    poll: {
        request: {
            endpoint: "default",
            path: "/team-management/api-keys/{API_KEY_ID}/usage",
            method: "GET",
        },
        map: {},
    },
    script: "connector.ts",
};

const USAGE_PAYLOAD = {
    api_key_id: "550e8400-e29b-41d4-a716-446655440000",
    api_key_name: "Production API Key",
    team_id: "660e8400-e29b-41d4-a716-446655440000",
    period: { start: "2025-01-01T00:00:00Z", end: "2025-01-31T23:59:59Z" },
    total_cost_usd: 45.67,
    cost_breakdown: [
        {
            price_id: "price_neural_search",
            price_name: "Neural Search",
            quantity: 1000,
            amount_usd: 30,
        },
        {
            price_id: "price_content_retrieval",
            price_name: "Content Retrieval",
            quantity: 500,
            amount_usd: 15.67,
        },
    ],
};

const EXPECTED_RESET_AT = Date.parse("2025-01-31T23:59:59Z");
const EXPECTED_CYCLE_MS = EXPECTED_RESET_AT - Date.parse("2025-01-01T00:00:00Z");

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
    payload: unknown = USAGE_PAYLOAD,
    params: Record<string, string> = {
        SERVICE_KEY: "test-service-key",
        API_KEY_ID: "test-key-id",
        LIMIT: "100",
    },
): ConnectorContext {
    const get_json = vi
        .fn<ConnectorContext["http"]["get_json"]>()
        .mockImplementation((endpoint_key, path, opts) => {
            expect(endpoint_key).toBe("default");
            expect(opts?.headers?.["x-api-key"]).toBe("test-service-key");
            if (path === "/team-management/api-keys/test-key-id/usage")
                return Promise.resolve(payload);
            throw new Error(`unexpected path ${path}`);
        });
    return create_ctx_with_get_json(get_json, params);
}

async function read_connector_script() {
    return readFile(join("connectors", "exa", "connector.ts"), "utf8");
}

async function run_exa_with_ctx(ctx: ConnectorContext) {
    return run_connector(manifest, await read_connector_script(), ctx);
}

async function run_exa(payload?: unknown, params?: Record<string, string>) {
    return run_exa_with_ctx(create_ctx(payload, params));
}

function find_total(result: { observations: ScriptObservationLike[] }) {
    return result.observations.find((o) => o.raw_label === "total_cost_usd");
}

interface ScriptObservationLike {
    readonly raw_label: string;
    readonly used: number | null;
    readonly limit: number | null;
    readonly status: string;
}

describe("exa connector", () => {
    it("maps total_cost_usd + cost_breakdown to observations", async () => {
        const result = await run_exa();

        expect(result.error).toBeNull();
        expect(result.observations.map((o) => o.metric_id)).toEqual([
            "exa:total_cost_usd",
            "exa:price_neural_search",
            "exa:price_content_retrieval",
        ]);

        expect(result.observations[0]).toEqual(
            expect.objectContaining({
                provider: "exa",
                account_id: "test-key-id",
                account_label: "Production API Key",
                raw_label: "total_cost_usd",
                normalized_label: "总成本 (USD)",
                used: 45.67,
                limit: 100,
                status: "normal",
                reset_at: EXPECTED_RESET_AT,
                cycleDurationMs: EXPECTED_CYCLE_MS,
                window: "total",
                display_style: "ratio",
                source: "poll",
                stale: false,
                last_error: null,
            }),
        );

        expect(result.observations[1]).toEqual(
            expect.objectContaining({
                metric_id: "exa:price_neural_search",
                raw_label: "price_neural_search",
                normalized_label: "Neural Search",
                used: 30,
                limit: null,
                status: "unknown",
            }),
        );
        expect(result.observations[2]).toEqual(
            expect.objectContaining({
                metric_id: "exa:price_content_retrieval",
                used: 15.67,
                limit: null,
                status: "unknown",
            }),
        );
    });

    it("marks total cost critical when ratio >= 0.9", async () => {
        const result = await run_exa(USAGE_PAYLOAD, {
            SERVICE_KEY: "test-service-key",
            API_KEY_ID: "test-key-id",
            LIMIT: "50",
        });
        const total = find_total(result);
        expect(total?.status).toBe("critical");
        expect(total?.limit).toBe(50);
    });

    it("marks total cost warning when 0.75 <= ratio < 0.9", async () => {
        const result = await run_exa(USAGE_PAYLOAD, {
            SERVICE_KEY: "test-service-key",
            API_KEY_ID: "test-key-id",
            LIMIT: "60",
        });
        const total = find_total(result);
        expect(total?.status).toBe("warning");
        expect(total?.limit).toBe(60);
    });

    it("returns single total=0 observation on zero usage", async () => {
        const result = await run_exa({
            api_key_id: "x",
            api_key_name: null,
            period: { start: "2025-01-01T00:00:00Z", end: "2025-01-31T23:59:59Z" },
            total_cost_usd: 0,
            cost_breakdown: [],
        });

        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(1);
        expect(result.observations[0]).toEqual(
            expect.objectContaining({ used: 0, limit: 100, status: "normal" }),
        );
    });

    it("status is unknown and limit null when LIMIT missing", async () => {
        const result = await run_exa(USAGE_PAYLOAD, {
            SERVICE_KEY: "test-service-key",
            API_KEY_ID: "test-key-id",
        });
        const total = find_total(result);
        expect(total?.status).toBe("unknown");
        expect(total?.limit).toBeNull();
    });

    it("status is unknown and limit null when LIMIT <= 0", async () => {
        const result_zero = await run_exa(USAGE_PAYLOAD, {
            SERVICE_KEY: "test-service-key",
            API_KEY_ID: "test-key-id",
            LIMIT: "0",
        });
        const result_neg = await run_exa(USAGE_PAYLOAD, {
            SERVICE_KEY: "test-service-key",
            API_KEY_ID: "test-key-id",
            LIMIT: "-5",
        });
        expect(find_total(result_zero)?.status).toBe("unknown");
        expect(find_total(result_zero)?.limit).toBeNull();
        expect(find_total(result_neg)?.status).toBe("unknown");
        expect(find_total(result_neg)?.limit).toBeNull();
    });

    it("status is unknown when LIMIT is non-numeric", async () => {
        const result = await run_exa(USAGE_PAYLOAD, {
            SERVICE_KEY: "test-service-key",
            API_KEY_ID: "test-key-id",
            LIMIT: "abc",
        });
        const total = find_total(result);
        expect(total?.status).toBe("unknown");
        expect(total?.limit).toBeNull();
    });

    it("returns no observations when SERVICE_KEY or API_KEY_ID missing", async () => {
        const get_json = vi
            .fn<ConnectorContext["http"]["get_json"]>()
            .mockResolvedValue(USAGE_PAYLOAD);
        const ctx_no_service = create_ctx_with_get_json(get_json, {
            API_KEY_ID: "test-key-id",
            LIMIT: "100",
        });
        const ctx_no_id = create_ctx_with_get_json(get_json, {
            SERVICE_KEY: "test-service-key",
            LIMIT: "100",
        });

        expect((await run_exa_with_ctx(ctx_no_service)).observations).toEqual([]);
        expect((await run_exa_with_ctx(ctx_no_id)).observations).toEqual([]);
        expect(get_json).not.toHaveBeenCalled();
    });

    it("throws when API response is not an object", async () => {
        const result = await run_exa(null);

        expect(result.error).not.toBeNull();
        expect(result.error).toContain("Exa API 返回格式异常");
        expect(result.observations).toEqual([]);
    });

    it("propagates http error (non-2xx) as result.error", async () => {
        const get_json = vi
            .fn<ConnectorContext["http"]["get_json"]>()
            .mockRejectedValue(new Error("HTTP 401 Unauthorized"));
        const ctx = create_ctx_with_get_json(get_json, {
            SERVICE_KEY: "test-service-key",
            API_KEY_ID: "test-key-id",
            LIMIT: "100",
        });

        const result = await run_exa_with_ctx(ctx);

        expect(result.error).not.toBeNull();
        expect(result.error).toContain("HTTP 401");
        expect(result.observations).toEqual([]);
    });
});
