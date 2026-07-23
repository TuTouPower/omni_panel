import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";

const manifest: Manifest = {
    id: "mimo",
    provider: "mimo",
    capabilities: ["session"],
    parameters: [
        {
            name: "SESSION_COOKIE",
            type: "secret",
            required: true,
            exposeToScript: true,
        },
        {
            name: "LIMIT",
            type: "number",
            required: false,
            exposeToScript: true,
            default: "100",
        },
    ],
    endpoints: { default: "https://platform.xiaomimimo.com" },
    script: "connector.ts",
};

function create_ctx(usage: unknown, detail: unknown, balance: unknown): ConnectorContext {
    return {
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        http: {
            get_json(_endpoint, path) {
                if (path === "/api/v1/tokenPlan/usage") return Promise.resolve(usage);
                if (path === "/api/v1/tokenPlan/detail") return Promise.resolve(detail);
                if (path === "/api/v1/balance") return Promise.resolve(balance);
                return Promise.reject(new Error(`unexpected path ${path}`));
            },
            post_json: () => Promise.resolve({}),
            get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
        },
        files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
        params: { SESSION_COOKIE: "cookie-value", LIMIT: "100" },
        report_failed_account: () => undefined,
    };
}

describe("mimo connector", () => {
    it("maps plan quota items and balance to observations", async () => {
        const script = await readFile(join("connectors", "mimo", "connector.ts"), "utf8");
        const result = await run_connector(
            manifest,
            script,
            create_ctx(
                {
                    code: 0,
                    data: {
                        usage: {
                            items: [
                                {
                                    name: "plan_total_token",
                                    used: 40,
                                    limit: 100,
                                    percent: 40,
                                },
                                {
                                    name: "compensation_total_token",
                                    used: 10,
                                    limit: 50,
                                    percent: 20,
                                },
                            ],
                        },
                    },
                },
                {
                    code: 0,
                    data: {
                        planName: "Pro Plan",
                        currentPeriodEnd: "2026-07-01T00:00:00Z",
                    },
                },
                { code: 0, data: { balance: "75.5" } },
            ),
        );

        expect(result.error).toBeNull();
        const ids = result.observations.map((o) => o.metric_id);
        expect(ids).toEqual([
            "mimo:plan_total_token",
            "mimo:compensation_total_token",
            "mimo:balance",
        ]);

        expect(result.observations[0]).toEqual(
            expect.objectContaining({
                provider: "mimo",
                account_label: "Pro Plan",
                raw_label: "plan_total_token",
                normalized_label: "套餐额度",
                used: 40,
                limit: 100,
                display_style: "percent",
                status: "normal",
                reset_at: Date.parse("2026-07-01T00:00:00Z"),
            }),
        );
        expect(result.observations[1]?.normalized_label).toBe("补偿积分");
        expect(result.observations[1]?.raw_label).toBe("compensation_total_token");
        expect(result.observations[2]?.normalized_label).toBe("余额");
        expect(result.observations[2]?.raw_label).toBe("balance");
        expect(result.observations[2]?.used).toBe(75.5);
    });

    it("balance status reversed: low -> critical, mid -> warning, high -> normal", async () => {
        const script = await readFile(join("connectors", "mimo", "connector.ts"), "utf8");
        const empty_usage = { code: 0, data: { usage: { items: [] } } };

        const low = await run_connector(
            manifest,
            script,
            create_ctx(empty_usage, { code: 0, data: {} }, { code: 0, data: { balance: 5 } }),
        );
        expect(low.observations.find((o) => o.raw_label === "balance")?.status).toBe("critical");

        const warn = await run_connector(
            manifest,
            script,
            create_ctx(empty_usage, { code: 0, data: {} }, { code: 0, data: { balance: 15 } }),
        );
        expect(warn.observations.find((o) => o.raw_label === "balance")?.status).toBe("warning");

        const ok = await run_connector(
            manifest,
            script,
            create_ctx(
                empty_usage,
                { code: 0, data: {} },
                {
                    code: 0,
                    data: { balance: 75.5 },
                },
            ),
        );
        expect(ok.observations.find((o) => o.raw_label === "balance")?.status).toBe("normal");
    });

    it("balance threshold boundaries 0.1/0.2 locked (<= semantics)", async () => {
        const script = await readFile(join("connectors", "mimo", "connector.ts"), "utf8");
        const empty_usage = { code: 0, data: { usage: { items: [] } } };

        const boundary_critical = await run_connector(
            manifest,
            script,
            create_ctx(empty_usage, { code: 0, data: {} }, { code: 0, data: { balance: 10 } }),
        );
        // 10/100 = 0.1 -> critical（闭区间 <=0.1）
        expect(boundary_critical.observations.find((o) => o.raw_label === "balance")?.status).toBe(
            "critical",
        );

        const boundary_warning = await run_connector(
            manifest,
            script,
            create_ctx(empty_usage, { code: 0, data: {} }, { code: 0, data: { balance: 20 } }),
        );
        // 20/100 = 0.2 -> warning（<=0.2，>0.1）
        expect(boundary_warning.observations.find((o) => o.raw_label === "balance")?.status).toBe(
            "warning",
        );
    });

    it("balance near zero (0.01) -> critical", async () => {
        const script = await readFile(join("connectors", "mimo", "connector.ts"), "utf8");
        const result = await run_connector(
            manifest,
            script,
            create_ctx(
                { code: 0, data: { usage: { items: [] } } },
                { code: 0, data: {} },
                { code: 0, data: { balance: 0.01 } },
            ),
        );
        expect(result.observations.find((o) => o.raw_label === "balance")?.status).toBe("critical");
    });

    it("returns empty when usage code is non-zero", async () => {
        const script = await readFile(join("connectors", "mimo", "connector.ts"), "utf8");
        const result = await run_connector(
            manifest,
            script,
            create_ctx({ code: 401, message: "expired" }, { code: 0, data: {} }, { code: 0 }),
        );

        expect(result.error).not.toBeNull();
        expect(result.observations).toEqual([]);
    });

    it("preserves HTTP error message when usage request rejects", async () => {
        const script = await readFile(join("connectors", "mimo", "connector.ts"), "utf8");
        const error_ctx: ConnectorContext = {
            log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
            http: {
                get_json(_endpoint, path) {
                    if (path === "/api/v1/tokenPlan/usage")
                        return Promise.reject(new Error("HTTP 401 Unauthorized"));
                    if (path === "/api/v1/tokenPlan/detail")
                        return Promise.resolve({ code: 0, data: {} });
                    if (path === "/api/v1/balance") return Promise.resolve({ code: 0 });
                    return Promise.reject(new Error(`unexpected path ${path}`));
                },
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
            files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
            params: { SESSION_COOKIE: "cookie-value", LIMIT: "100" },
            report_failed_account: () => undefined,
        };
        const result = await run_connector(manifest, script, error_ctx);
        expect(result.error).not.toBeNull();
        expect(result.error).toContain("HTTP 401 Unauthorized");
        expect(result.observations).toEqual([]);
    });

    it("still returns usage items when balance endpoint fails", async () => {
        const script = await readFile(join("connectors", "mimo", "connector.ts"), "utf8");
        const result = await run_connector(
            manifest,
            script,
            create_ctx(
                {
                    code: 0,
                    data: {
                        usage: {
                            items: [{ name: "plan_total_token", used: 1, limit: 10, percent: 10 }],
                        },
                    },
                },
                { code: 0, data: { planName: "Basic" } },
                { code: 500 },
            ),
        );

        expect(result.observations.map((o) => o.metric_id)).toEqual(["mimo:plan_total_token"]);
    });

    it("still returns usage items when detail API returns null", async () => {
        const script = await readFile(join("connectors", "mimo", "connector.ts"), "utf8");
        const detail_null_ctx: ConnectorContext = {
            log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
            http: {
                get_json(_endpoint, path) {
                    if (path === "/api/v1/tokenPlan/usage")
                        return Promise.resolve({
                            code: 0,
                            data: {
                                usage: {
                                    items: [
                                        {
                                            name: "plan_total_token",
                                            used: 5,
                                            limit: 50,
                                            percent: 10,
                                        },
                                    ],
                                },
                            },
                        });
                    if (path === "/api/v1/tokenPlan/detail")
                        return Promise.reject(new Error("network error"));
                    if (path === "/api/v1/balance") return Promise.resolve({ code: 0 });
                    return Promise.reject(new Error(`unexpected path ${path}`));
                },
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
            files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
            params: { SESSION_COOKIE: "cookie-value", LIMIT: "100" },
            report_failed_account: () => undefined,
        };
        const result = await run_connector(manifest, script, detail_null_ctx);

        expect(result.error).toBeNull();
        expect(result.observations.map((o) => o.metric_id)).toEqual(["mimo:plan_total_token"]);
        expect(result.observations[0]?.account_label).toBe("MiMo");
    });

    it("reports failed_account when usage items empty and balance unavailable", async () => {
        const script = await readFile(join("connectors", "mimo", "connector.ts"), "utf8");
        const result = await run_connector(
            manifest,
            script,
            create_ctx(
                { code: 0, data: { usage: { items: [] } } },
                { code: 0, data: {} },
                { code: 500 },
            ),
        );
        expect(result.observations).toEqual([]);
        expect(result.failed_accounts).toHaveLength(1);
        expect(result.failed_accounts[0]?.provider).toBe("mimo");
    });
});
