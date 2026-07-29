import { readFile } from "node:fs/promises";
import { ctx_status } from "./_ctx_status";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import { manifest_schema, type Manifest } from "../../../src/shared/schemas/manifest";

const manifest: Manifest = {
    id: "grok",
    provider: "grok",
    capabilities: ["poll"],
    parameters: [],
    endpoints: { grok_billing: "https://cli-chat-proxy.grok.com" },
    poll: {
        request: {
            endpoint: "grok_billing",
            path: "/v1/billing?format=credits",
            method: "GET",
            auth: { type: "bearer", secret: "OAUTH_TOKEN" },
        },
        map: {},
    },
    script: "connector.ts",
};

// 真实 billing 响应结构（2026-07-14 实测，脱敏）
const billing_response = {
    config: {
        currentPeriod: {
            type: "USAGE_PERIOD_TYPE_WEEKLY",
            start: "2026-07-13T23:10:25.819831+00:00",
            end: "2026-07-20T23:10:25.819831+00:00",
        },
        creditUsagePercent: 19.0,
        onDemandCap: { val: 0 },
        onDemandUsed: { val: 0 },
        productUsage: [
            { product: "GrokImagine", usagePercent: 12.0 },
            { product: "GrokBuild", usagePercent: 7.0 },
            { product: "GrokChat" },
        ],
        isUnifiedBillingUser: true,
        prepaidBalance: { val: 0 },
        topUpMethod: "TOP_UP_METHOD_SAVED_PAYMENT_METHOD",
        billingPeriodStart: "2026-07-13T23:10:25.819831+00:00",
        billingPeriodEnd: "2026-07-21T23:10:25.819831+00:00",
    },
};

const billing_response_zero_usage = {
    config: {
        currentPeriod: {
            type: "USAGE_PERIOD_TYPE_WEEKLY",
            start: "2026-01-04T00:00:00.000000+00:00",
            end: "2026-01-11T00:00:00.000000+00:00",
        },
        monthlyLimit: { val: 15_000 },
        used: { val: 13_434 },
        onDemandCap: { val: 0 },
        onDemandUsed: { val: 0 },
        isUnifiedBillingUser: true,
        prepaidBalance: { val: 0 },
        topUpMethod: "TOP_UP_METHOD_SAVED_PAYMENT_METHOD",
        billingPeriodStart: "2026-01-05T00:00:00.000000+00:00",
        billingPeriodEnd: "2026-01-12T00:00:00.000000+00:00",
    },
};

function create_ctx(): ConnectorContext {
    return {
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        http: {
            get_json(endpoint_key: string, path: string) {
                expect(endpoint_key).toBe("grok_billing");
                expect(path).toBe("/v1/billing?format=credits");
                return Promise.resolve(billing_response);
            },
            post_json: () => Promise.resolve({}),
            get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
        },
        files: {
            read: () => Promise.resolve(""),
            list: () => Promise.resolve([]),
        },
        params: {},
        status: ctx_status,
        report_failed_account: () => undefined,
    };
}

describe("grok connector", () => {
    it("declares a poll-only manifest with bearer OAuth auth", async () => {
        const raw = JSON.parse(
            await readFile(join("connectors", "grok", "manifest.json"), "utf8"),
        ) as unknown;
        const parsed = manifest_schema.parse(raw);

        expect(parsed.capabilities).toEqual(["poll"]);
        expect(parsed.local).toBeUndefined();
        expect(parsed.poll?.request).toEqual(
            expect.objectContaining({
                endpoint: "grok_billing",
                path: "/v1/billing?format=credits",
                method: "GET",
                auth: { type: "bearer", secret: "OAUTH_TOKEN" },
            }),
        );
    });

    it("parses billing response into total + per-product observations", async () => {
        const script = await readFile(join("connectors", "grok", "connector.ts"), "utf8");
        const result = await run_connector(manifest, script, create_ctx());

        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(3);

        // 总额度
        expect(result.observations[0]).toEqual(
            expect.objectContaining({
                provider: "grok",
                account_id: "grok",
                account_label: "Grok",
                metric_id: "grok:credits",
                raw_label: "credits",
                normalized_label: "额度",
                window: "week",
                used: 19,
                limit: 100,
                display_style: "percent",
                source: "poll",
                status: "normal",
            }),
        );
        expect(result.observations[0]?.reset_at).toBe(
            Date.parse("2026-07-20T23:10:25.819831+00:00"),
        );

        // GrokImagine
        expect(result.observations[1]).toEqual(
            expect.objectContaining({
                metric_id: "grok:product:grok_imagine",
                raw_label: "grok_imagine",
                used: 12,
                limit: 100,
                display_style: "percent",
                window: "week",
            }),
        );

        expect(result.observations[1]?.reset_at).toBe(
            Date.parse("2026-07-21T23:10:25.819831+00:00"),
        );

        // GrokBuild
        expect(result.observations[2]).toEqual(
            expect.objectContaining({
                metric_id: "grok:product:grok_build",
                raw_label: "grok_build",
                used: 7,
                limit: 100,
            }),
        );
        expect(result.observations[2]?.reset_at).toBe(
            Date.parse("2026-07-21T23:10:25.819831+00:00"),
        );
    });

    it("skips products without usagePercent", async () => {
        const ctx = create_ctx();
        const script = await readFile(join("connectors", "grok", "connector.ts"), "utf8");
        const result = await run_connector(manifest, script, ctx);

        const metric_ids = result.observations.map((o) => o.metric_id);
        expect(metric_ids).not.toContain("grok:product:grok_chat");
    });

    it("reports status as normal below 75%", async () => {
        const ctx: ConnectorContext = {
            ...create_ctx(),
            http: {
                get_json: () =>
                    Promise.resolve({
                        config: {
                            ...billing_response.config,
                            creditUsagePercent: 74,
                            productUsage: [],
                        },
                    }),
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
        };
        const script = await readFile(join("connectors", "grok", "connector.ts"), "utf8");
        const result = await run_connector(manifest, script, ctx);

        expect(result.observations[0]?.status).toBe("normal");
    });

    it("reports status as warning when usage >= 75%", async () => {
        const ctx: ConnectorContext = {
            ...create_ctx(),
            http: {
                get_json: () =>
                    Promise.resolve({
                        config: {
                            ...billing_response.config,
                            creditUsagePercent: 75,
                            productUsage: [],
                            billingPeriodEnd: "2026-07-20T23:10:25.819831+00:00",
                        },
                    }),
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
        };
        const script = await readFile(join("connectors", "grok", "connector.ts"), "utf8");
        const result = await run_connector(manifest, script, ctx);

        expect(result.observations[0]?.status).toBe("warning");
    });

    it("reports status as critical when usage >= 90%", async () => {
        const ctx: ConnectorContext = {
            ...create_ctx(),
            http: {
                get_json: () =>
                    Promise.resolve({
                        config: {
                            ...billing_response.config,
                            creditUsagePercent: 95,
                            productUsage: [],
                            billingPeriodEnd: "2026-07-20T23:10:25.819831+00:00",
                        },
                    }),
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
        };
        const script = await readFile(join("connectors", "grok", "connector.ts"), "utf8");
        const result = await run_connector(manifest, script, ctx);

        expect(result.observations[0]?.status).toBe("critical");
    });

    it("returns empty observations on billing API error", async () => {
        const ctx: ConnectorContext = {
            ...create_ctx(),
            http: {
                get_json: () => Promise.reject(new Error("HTTP 401: Unauthorized")),
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
        };
        const script = await readFile(join("connectors", "grok", "connector.ts"), "utf8");
        const result = await run_connector(manifest, script, ctx);

        // 401 时上报失败账号，返回空 observations（让 refresh-service 复制 stale 副本）
        expect(result.observations).toHaveLength(0);
        expect(result.failed_accounts).toHaveLength(1);
        expect(result.failed_accounts[0]?.provider).toBe("grok");
    });

    it("interprets an omitted weekly creditUsagePercent as zero usage", async () => {
        const ctx: ConnectorContext = {
            ...create_ctx(),
            http: {
                get_json: () => Promise.resolve(billing_response_zero_usage),
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
        };
        const script = await readFile(join("connectors", "grok", "connector.ts"), "utf8");
        const result = await run_connector(manifest, script, ctx);

        expect(result.failed_accounts).toHaveLength(0);
        expect(result.observations).toHaveLength(1);
        expect(result.observations[0]).toEqual(
            expect.objectContaining({
                metric_id: "grok:credits",
                window: "week",
                used: 0,
                limit: 100,
                status: "normal",
                reset_at: Date.parse("2026-01-11T00:00:00.000000+00:00"),
            }),
        );
    });

    it.each([
        ["missing type", { start: "2026-01-04T00:00:00Z", end: "2026-01-11T00:00:00Z" }],
        ["missing start", { type: "USAGE_PERIOD_TYPE_WEEKLY", end: "2026-01-11T00:00:00Z" }],
        ["missing end", { type: "USAGE_PERIOD_TYPE_WEEKLY", start: "2026-01-04T00:00:00Z" }],
        ["non-string dates", { type: "USAGE_PERIOD_TYPE_WEEKLY", start: 1, end: 2 }],
        [
            "invalid dates",
            { type: "USAGE_PERIOD_TYPE_WEEKLY", start: "invalid", end: "also-invalid" },
        ],
        [
            "invalid calendar date",
            {
                type: "USAGE_PERIOD_TYPE_WEEKLY",
                start: "2026-02-23T00:00:00Z",
                end: "2026-02-30T00:00:00Z",
            },
        ],
        [
            "non-increasing dates",
            {
                type: "USAGE_PERIOD_TYPE_WEEKLY",
                start: "2026-01-11T00:00:00Z",
                end: "2026-01-04T00:00:00Z",
            },
        ],
        [
            "unknown type",
            {
                type: "USAGE_PERIOD_TYPE_UNKNOWN",
                start: "2026-01-04T00:00:00Z",
                end: "2026-01-11T00:00:00Z",
            },
        ],
    ])("rejects omitted usage with an invalid currentPeriod: %s", async (_name, currentPeriod) => {
        const ctx: ConnectorContext = {
            ...create_ctx(),
            http: {
                get_json: () => Promise.resolve({ config: { currentPeriod } }),
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
        };
        const script = await readFile(join("connectors", "grok", "connector.ts"), "utf8");
        const result = await run_connector(manifest, script, ctx);

        expect(result.observations).toHaveLength(0);
        expect(result.failed_accounts).toHaveLength(1);
    });

    it("accepts lowercase RFC3339 separators for an omitted percentage", async () => {
        const reset_at = "2026-01-11t00:00:00z";
        const ctx: ConnectorContext = {
            ...create_ctx(),
            http: {
                get_json: () =>
                    Promise.resolve({
                        config: {
                            currentPeriod: {
                                type: "USAGE_PERIOD_TYPE_WEEKLY",
                                start: "2026-01-04t00:00:00z",
                                end: reset_at,
                            },
                        },
                    }),
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
        };
        const script = await readFile(join("connectors", "grok", "connector.ts"), "utf8");
        const result = await run_connector(manifest, script, ctx);

        expect(result.failed_accounts).toHaveLength(0);
        expect(result.observations).toEqual([
            expect.objectContaining({
                metric_id: "grok:credits",
                window: "week",
                used: 0,
                reset_at: Date.parse(reset_at),
            }),
        ]);
    });

    it.each([
        ["missing", undefined],
        [
            "invalid",
            {
                type: "USAGE_PERIOD_TYPE_UNKNOWN",
                start: "2026-01-04T00:00:00Z",
                end: "2026-01-11T00:00:00Z",
            },
        ],
    ])("preserves an explicit percentage with a %s currentPeriod", async (_name, currentPeriod) => {
        const legacy_reset = "2026-01-12T00:00:00Z";
        const ctx: ConnectorContext = {
            ...create_ctx(),
            http: {
                get_json: () =>
                    Promise.resolve({
                        config: {
                            currentPeriod,
                            creditUsagePercent: 19,
                            billingPeriodEnd: legacy_reset,
                        },
                    }),
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
        };
        const script = await readFile(join("connectors", "grok", "connector.ts"), "utf8");
        const result = await run_connector(manifest, script, ctx);

        expect(result.failed_accounts).toHaveLength(0);
        expect(result.observations).toEqual([
            expect.objectContaining({
                metric_id: "grok:credits",
                window: "week",
                used: 19,
                reset_at: Date.parse(legacy_reset),
            }),
        ]);
    });

    it.each([null, "0", Number.NaN, Number.POSITIVE_INFINITY])(
        "rejects an explicitly invalid creditUsagePercent: %s",
        async (creditUsagePercent) => {
            const ctx: ConnectorContext = {
                ...create_ctx(),
                http: {
                    get_json: () =>
                        Promise.resolve({
                            config: {
                                ...billing_response_zero_usage.config,
                                creditUsagePercent,
                            },
                        }),
                    post_json: () => Promise.resolve({}),
                    get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
                },
            };
            const script = await readFile(join("connectors", "grok", "connector.ts"), "utf8");
            const result = await run_connector(manifest, script, ctx);

            expect(result.observations).toHaveLength(0);
            expect(result.failed_accounts).toHaveLength(1);
        },
    );

    it("maps a valid monthly currentPeriod to a monthly observation", async () => {
        const ctx: ConnectorContext = {
            ...create_ctx(),
            http: {
                get_json: () =>
                    Promise.resolve({
                        config: {
                            currentPeriod: {
                                type: "USAGE_PERIOD_TYPE_MONTHLY",
                                start: "2026-01-01T00:00:00Z",
                                end: "2026-02-01T00:00:00Z",
                            },
                            creditUsagePercent: 25,
                        },
                    }),
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
        };
        const script = await readFile(join("connectors", "grok", "connector.ts"), "utf8");
        const result = await run_connector(manifest, script, ctx);

        expect(result.failed_accounts).toHaveLength(0);
        expect(result.observations).toEqual([
            expect.objectContaining({
                metric_id: "grok:credits",
                window: "month",
                cycleDurationMs: 30 * 24 * 3_600_000,
                used: 25,
                reset_at: Date.parse("2026-02-01T00:00:00Z"),
            }),
        ]);
    });

    it("maps an omitted monthly percentage to zero usage", async () => {
        const reset_at = "2026-02-01T00:00:00Z";
        const ctx: ConnectorContext = {
            ...create_ctx(),
            http: {
                get_json: () =>
                    Promise.resolve({
                        config: {
                            currentPeriod: {
                                type: "USAGE_PERIOD_TYPE_MONTHLY",
                                start: "2026-01-01T00:00:00Z",
                                end: reset_at,
                            },
                        },
                    }),
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
        };
        const script = await readFile(join("connectors", "grok", "connector.ts"), "utf8");
        const result = await run_connector(manifest, script, ctx);

        expect(result.failed_accounts).toHaveLength(0);
        expect(result.observations).toEqual([
            expect.objectContaining({
                metric_id: "grok:credits",
                window: "month",
                cycleDurationMs: 30 * 24 * 3_600_000,
                used: 0,
                limit: 100,
                reset_at: Date.parse(reset_at),
            }),
        ]);
    });

    it("treats explicit and omitted zero percentages identically", async () => {
        const script = await readFile(join("connectors", "grok", "connector.ts"), "utf8");
        const omitted_result = await run_connector(manifest, script, {
            ...create_ctx(),
            http: {
                get_json: () => Promise.resolve(billing_response_zero_usage),
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
        });
        const explicit_result = await run_connector(manifest, script, {
            ...create_ctx(),
            http: {
                get_json: () =>
                    Promise.resolve({
                        config: {
                            ...billing_response_zero_usage.config,
                            creditUsagePercent: 0,
                        },
                    }),
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
        });

        expect(omitted_result.failed_accounts).toHaveLength(0);
        expect(explicit_result.failed_accounts).toHaveLength(0);
        expect(omitted_result.observations).toHaveLength(1);
        expect(explicit_result.observations).toHaveLength(1);
        expect(omitted_result.observations[0]).toEqual({
            ...explicit_result.observations[0],
            observed_at: omitted_result.observations[0]?.observed_at,
        });
    });

    it("does not map deprecated monthly cent fields to weekly usage", async () => {
        const ctx: ConnectorContext = {
            ...create_ctx(),
            http: {
                get_json: () =>
                    Promise.resolve({
                        config: {
                            monthlyLimit: { val: 15_000 },
                            used: { val: 13_434 },
                            billingPeriodStart: "2026-07-01T00:00:00.000000+00:00",
                            billingPeriodEnd: "2026-08-01T00:00:00.000000+00:00",
                        },
                    }),
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
        };
        const script = await readFile(join("connectors", "grok", "connector.ts"), "utf8");
        const result = await run_connector(manifest, script, ctx);

        expect(result.observations).toHaveLength(0);
        expect(result.failed_accounts).toHaveLength(1);
        expect(result.failed_accounts[0]?.error).toBe(
            "billing response has no usable usage fields",
        );
    });

    it("reports failed_account when billing 200 returns config with no usable usage fields", async () => {
        // t039：HTTP 200 + config 存在但 creditUsagePercent 缺失且 productUsage 全无
        // usagePercent 时，connector 不得静默返回空 observations（否则 refresh 误判
        // ready+空，清空历史、主面板显示"暂无账号"）。须上报 failed_account。
        const ctx: ConnectorContext = {
            ...create_ctx(),
            http: {
                get_json: () =>
                    Promise.resolve({
                        config: {
                            productUsage: [],
                        },
                    }),
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
        };
        const script = await readFile(join("connectors", "grok", "connector.ts"), "utf8");
        const result = await run_connector(manifest, script, ctx);

        expect(result.observations).toHaveLength(0);
        expect(result.failed_accounts).toHaveLength(1);
        expect(result.failed_accounts[0]?.provider).toBe("grok");
        expect(result.failed_accounts[0]?.error).toMatch(/usage/i);
    });
});
