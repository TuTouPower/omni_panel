import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";

const manifest: Manifest = {
    id: "tikhub",
    provider: "tikhub",
    capabilities: ["poll"],
    parameters: [
        { name: "API_KEY", type: "secret", required: true, exposeToScript: true },
        { name: "LIMIT", type: "number", required: false, exposeToScript: true },
    ],
    endpoints: { default: "https://api.tikhub.io" },
    poll: {
        request: {
            endpoint: "default",
            path: "/api/v1/tikhub/user/get_user_info",
            method: "GET",
        },
        map: {},
    },
    script: "connector.ts",
};

const USER_INFO = {
    code: 200,
    router: "/api/v1/tikhub/user/get_user_info",
    user_data: { email: "user@example.com", balance: 100, free_credit: 50, is_active: true },
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
        report_failed_account: () => undefined,
    };
}

function create_ctx(
    payload: unknown = USER_INFO,
    params: Record<string, string> = { API_KEY: "test-token", LIMIT: "200" },
): ConnectorContext {
    const get_json = vi
        .fn<ConnectorContext["http"]["get_json"]>()
        .mockImplementation((endpoint_key, path, opts) => {
            expect(endpoint_key).toBe("default");
            expect(path).toBe("/api/v1/tikhub/user/get_user_info");
            expect(opts?.headers?.["Authorization"]).toBe("Bearer test-token");
            return Promise.resolve(payload);
        });
    return create_ctx_with_get_json(get_json, params);
}

async function read_connector_script() {
    return readFile(join("connectors", "tikhub", "connector.ts"), "utf8");
}

async function run_tikhub_with_ctx(ctx: ConnectorContext) {
    return run_connector(manifest, await read_connector_script(), ctx);
}

async function run_tikhub(payload?: unknown, params?: Record<string, string>) {
    return run_tikhub_with_ctx(create_ctx(payload, params));
}

describe("tikhub connector", () => {
    it("maps user_data.balance + free_credit, account_id=email", async () => {
        const result = await run_tikhub();

        expect(result.error).toBeNull();
        expect(result.observations.map((o) => o.metric_id)).toEqual([
            "tikhub:balance",
            "tikhub:free_credit",
        ]);

        expect(result.observations[0]).toEqual(
            expect.objectContaining({
                provider: "tikhub",
                account_id: "user@example.com",
                account_label: "user@example.com",
                raw_label: "balance",
                normalized_label: "付费余额 (USD)",
                used: 100,
                limit: 200,
                status: "normal",
                window: "total",
                display_style: "ratio",
                source: "poll",
            }),
        );
        expect(result.observations[1]).toEqual(
            expect.objectContaining({
                metric_id: "tikhub:free_credit",
                raw_label: "free_credit",
                normalized_label: "免费额度 (USD)",
                used: 50,
                limit: null,
                status: "unknown",
            }),
        );
    });

    it("balance status reversed: low -> critical", async () => {
        // balance 10 + LIMIT 200: 0.05 critical
        const low = await run_tikhub(
            { ...USER_INFO, user_data: { ...USER_INFO.user_data, balance: 10 } },
            { API_KEY: "test-token", LIMIT: "200" },
        );
        const bal = low.observations.find((o) => o.raw_label === "balance");
        expect(bal?.status).toBe("critical");
    });

    it("balance status warning when 0.1 < ratio <= 0.2", async () => {
        const result = await run_tikhub(
            { ...USER_INFO, user_data: { ...USER_INFO.user_data, balance: 30 } },
            { API_KEY: "test-token", LIMIT: "200" },
        );
        // 30/200 = 0.15 warning
        const bal = result.observations.find((o) => o.raw_label === "balance");
        expect(bal?.status).toBe("warning");
    });

    it("balance ratio=0.1 boundary -> critical", async () => {
        const result = await run_tikhub(
            { ...USER_INFO, user_data: { ...USER_INFO.user_data, balance: 20 } },
            { API_KEY: "test-token", LIMIT: "200" },
        );
        expect(result.observations.find((o) => o.raw_label === "balance")?.status).toBe("critical");
    });

    it("balance ratio=0.2 boundary -> warning", async () => {
        const result = await run_tikhub(
            { ...USER_INFO, user_data: { ...USER_INFO.user_data, balance: 40 } },
            { API_KEY: "test-token", LIMIT: "200" },
        );
        expect(result.observations.find((o) => o.raw_label === "balance")?.status).toBe("warning");
    });

    it("LIMIT missing -> balance unknown + null, free_credit still unknown", async () => {
        const result = await run_tikhub(USER_INFO, { API_KEY: "test-token" });
        const bal = result.observations.find((o) => o.raw_label === "balance");
        expect(bal?.status).toBe("unknown");
        expect(bal?.limit).toBeNull();
    });

    it("falls back account_id to tikhub when email missing", async () => {
        const result = await run_tikhub({
            code: 200,
            user_data: { balance: 5, free_credit: 0 },
        });
        expect(result.observations[0]?.account_id).toBe("tikhub");
        expect(result.observations[0]?.account_label).toBe("TikHub");
    });

    it("returns no observations when API_KEY missing", async () => {
        const get_json = vi.fn<ConnectorContext["http"]["get_json"]>().mockResolvedValue(USER_INFO);
        const ctx = create_ctx_with_get_json(get_json, { LIMIT: "200" });
        const result = await run_tikhub_with_ctx(ctx);
        expect(result.observations).toEqual([]);
        expect(get_json).not.toHaveBeenCalled();
    });

    it("throws when code != 200", async () => {
        const result = await run_tikhub({ code: 401, message: "invalid token" });
        expect(result.error).not.toBeNull();
        expect(result.error).toContain("TikHub API 错误");
        expect(result.error).toContain("invalid token");
    });

    it("throws when user_data missing", async () => {
        const result = await run_tikhub({ code: 200 });
        expect(result.error).not.toBeNull();
        expect(result.error).toContain("user_data");
    });

    it("throws when user_data has no balance/free_credit", async () => {
        const result = await run_tikhub({ code: 200, user_data: { email: "x@y.com" } });
        expect(result.error).not.toBeNull();
        expect(result.error).toContain("balance/free_credit");
    });

    it("propagates http error as result.error", async () => {
        const get_json = vi
            .fn<ConnectorContext["http"]["get_json"]>()
            .mockRejectedValue(new Error("HTTP 500"));
        const ctx = create_ctx_with_get_json(get_json, { API_KEY: "t", LIMIT: "200" });
        const result = await run_tikhub_with_ctx(ctx);
        expect(result.error).toContain("HTTP 500");
        expect(result.observations).toEqual([]);
    });
});
