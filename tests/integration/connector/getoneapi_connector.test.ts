import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";

const manifest: Manifest = {
    id: "getoneapi",
    provider: "getoneapi",
    capabilities: ["poll"],
    parameters: [
        { name: "API_KEY", type: "secret", required: true, exposeToScript: true },
        { name: "LIMIT", type: "number", required: false, exposeToScript: true },
    ],
    endpoints: { default: "https://api.getoneapi.com" },
    poll: {
        request: { endpoint: "default", path: "/back/user/balance", method: "POST" },
        map: {},
    },
    script: "connector.ts",
};

const BALANCE_PAYLOAD = { code: 200, message: "success", data: { balance: 1.88 } };

function create_ctx_with_post_json(
    post_json: ConnectorContext["http"]["post_json"],
    params: Record<string, string>,
): ConnectorContext {
    return {
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        http: {
            get_json: () => Promise.resolve({}),
            post_json,
            get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
        },
        files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
        params,
        report_failed_account: () => undefined,
    };
}

function create_ctx(
    payload: unknown = BALANCE_PAYLOAD,
    params: Record<string, string> = { API_KEY: "test-key", LIMIT: "5" },
): ConnectorContext {
    const post_json = vi
        .fn<ConnectorContext["http"]["post_json"]>()
        .mockImplementation((endpoint_key, path, _body, opts) => {
            expect(endpoint_key).toBe("default");
            expect(path).toBe("/back/user/balance");
            expect(opts?.headers?.["Authorization"]).toBe("Bearer test-key");
            return Promise.resolve(payload);
        });
    return create_ctx_with_post_json(post_json, params);
}

async function read_connector_script() {
    return readFile(join("connectors", "getoneapi", "connector.ts"), "utf8");
}

async function run_getoneapi_with_ctx(ctx: ConnectorContext) {
    return run_connector(manifest, await read_connector_script(), ctx);
}

async function run_getoneapi(payload?: unknown, params?: Record<string, string>) {
    return run_getoneapi_with_ctx(create_ctx(payload, params));
}

describe("getoneapi connector", () => {
    it("maps data.balance to balance observation", async () => {
        const result = await run_getoneapi();

        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(1);
        expect(result.observations[0]).toEqual(
            expect.objectContaining({
                provider: "getoneapi",
                account_id: "getoneapi",
                account_label: "GetOneAPI",
                raw_label: "balance",
                normalized_label: "余额 (CNY)",
                used: 1.88,
                limit: 5,
                status: "normal",
                window: "total",
                display_style: "ratio",
                source: "poll",
                stale: false,
                last_error: null,
            }),
        );
    });

    it("marks critical when balance/limit <= 0.1", async () => {
        const result = await run_getoneapi(BALANCE_PAYLOAD, {
            API_KEY: "test-key",
            LIMIT: "20",
        });
        // 1.88/20 = 0.094 -> critical
        expect(result.observations[0]?.status).toBe("critical");
    });

    it("marks warning when 0.1 < balance/limit <= 0.2", async () => {
        const result = await run_getoneapi(BALANCE_PAYLOAD, {
            API_KEY: "test-key",
            LIMIT: "10",
        });
        // 1.88/10 = 0.188 -> warning
        expect(result.observations[0]?.status).toBe("warning");
    });

    it("status unknown and limit null when LIMIT missing", async () => {
        const result = await run_getoneapi(BALANCE_PAYLOAD, { API_KEY: "test-key" });
        expect(result.observations[0]?.status).toBe("unknown");
        expect(result.observations[0]?.limit).toBeNull();
    });

    it("returns no observations when API_KEY missing", async () => {
        const post_json = vi
            .fn<ConnectorContext["http"]["post_json"]>()
            .mockResolvedValue(BALANCE_PAYLOAD);
        const ctx = create_ctx_with_post_json(post_json, { LIMIT: "100" });

        const result = await run_getoneapi_with_ctx(ctx);
        expect(result.observations).toEqual([]);
        expect(post_json).not.toHaveBeenCalled();
    });

    it("throws when code != 200", async () => {
        const result = await run_getoneapi({ code: 401, message: "invalid api key" });
        expect(result.error).not.toBeNull();
        expect(result.error).toContain("invalid api key");
    });

    it("throws when data missing", async () => {
        const result = await run_getoneapi({ code: 200, message: "ok" });
        expect(result.error).not.toBeNull();
        expect(result.error).toContain("缺少 data");
    });

    it("throws when data.balance key missing (data:{})", async () => {
        const result = await run_getoneapi({ code: 200, message: "ok", data: {} });
        expect(result.error).not.toBeNull();
        expect(result.error).toContain("data.balance");
    });

    it("propagates http error as result.error", async () => {
        const post_json = vi
            .fn<ConnectorContext["http"]["post_json"]>()
            .mockRejectedValue(new Error("HTTP 500"));
        const ctx = create_ctx_with_post_json(post_json, {
            API_KEY: "test-key",
            LIMIT: "100",
        });

        const result = await run_getoneapi_with_ctx(ctx);
        expect(result.error).toContain("HTTP 500");
        expect(result.observations).toEqual([]);
    });
});
