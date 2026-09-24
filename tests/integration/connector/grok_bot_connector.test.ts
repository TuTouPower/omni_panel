import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ctx_status } from "./_ctx_status";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import { manifest_schema, type Manifest } from "../../../src/shared/schemas/manifest";

const test_manifest: Manifest = {
    id: "grok_bot",
    provider: "grok_bot",
    capabilities: ["poll"],
    parameters: [
        {
            name: "ACCESS_TOKEN",
            type: "secret",
            required: true,
            label: "Access Token",
            exposeToScript: true,
        },
    ],
    auth: {
        method: "oauth_pkce",
        secret_name: "ACCESS_TOKEN",
        extra_fields: ["REFRESH_TOKEN"],
    },
    endpoints: { cursor_api: "https://api2.cursor.sh" },
    poll: {
        request: {
            endpoint: "cursor_api",
            path: "/aiserver.v1.DashboardService/GetSandUsageStatus",
            method: "POST",
            auth: { type: "bearer", secret: "ACCESS_TOKEN" },
        },
        map: {},
    },
    script: "connector.ts",
};

const mock_sand_response = {
    usagePercent: 97.27,
    hasAvailableUsage: true,
    nextResetTimestampUtc: "2026-09-25T10:03:00Z",
    grokPlanLabel: "pro",
};

const mock_period_response = {
    spendLimitUsage: {
        individualUsed: 250, // $2.50
        individualLimit: 1000, // $10.00
        individualRemaining: 750,
    },
    billingCycleEnd: 1791535440000,
};

// 构造一个测试用 JWT: sub="user_123", email="user@example.com"
const mock_payload = Buffer.from(
    JSON.stringify({ sub: "user_123", email: "user@example.com" }),
).toString("base64url");
const mock_jwt = `eyJhbGciOiJIUzI1NiJ9.${mock_payload}.signature`;

describe("grok_bot connector", () => {
    it("declares a valid manifest matching schema", async () => {
        const raw = JSON.parse(
            await readFile(join("connectors", "grok_bot", "manifest.json"), "utf8"),
        ) as unknown;
        const parsed = manifest_schema.parse(raw);

        expect(parsed.id).toBe("grok_bot");
        expect(parsed.provider).toBe("grok_bot");
        expect(parsed.capabilities).toEqual(["poll"]);
        expect(parsed.auth?.method).toBe("oauth_pkce");
        expect(parsed.endpoints?.["cursor_api"]).toBe("https://api2.cursor.sh");
    });

    it("parses weekly and on-demand observations successfully", async () => {
        const script = await readFile(join("connectors", "grok_bot", "connector.ts"), "utf8");
        const posted_paths: string[] = [];
        const posted_headers: Record<string, string>[] = [];

        const ctx: ConnectorContext = {
            log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
            http: {
                get_json: () => Promise.reject(new Error("unexpected get_json")),
                post_json(endpoint_key, path, _body, opts) {
                    expect(endpoint_key).toBe("cursor_api");
                    posted_paths.push(path);
                    if (opts?.headers) posted_headers.push(opts.headers);
                    if (path.includes("GetSandUsageStatus")) {
                        return Promise.resolve(mock_sand_response);
                    }
                    if (path.includes("GetCurrentPeriodUsage")) {
                        return Promise.resolve(mock_period_response);
                    }
                    return Promise.reject(new Error("unknown path"));
                },
                get_raw: () => Promise.reject(new Error("unexpected get_raw")),
            },
            files: {
                read: () => Promise.resolve(""),
                list: () => Promise.resolve([]),
            },
            params: { ACCESS_TOKEN: mock_jwt },
            status: ctx_status,
            report_failed_account: vi.fn(),
        };

        const result = await run_connector(test_manifest, script, ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(2);

        // 校验 Header 包含 checksum 等防伪头
        expect(posted_headers).toHaveLength(2);
        for (const h of posted_headers) {
            expect(h["x-cursor-client-type"]).toBe("sand");
            expect(h["x-cursor-checksum"]).toBeDefined();
            expect(typeof h["x-cursor-checksum"]).toBe("string");
            expect(h["x-cursor-checksum"]?.length).toBeGreaterThan(10);
            expect(h["x-request-id"]).toBeDefined();
        }

        // 校验 weekly 指标
        const weekly = result.observations.find((o) => o.metric_id === "grok_bot:weekly");
        expect(weekly).toBeDefined();
        expect(weekly?.provider).toBe("grok_bot");
        expect(weekly?.account_id).toBe("user_123");
        expect(weekly?.account_label).toBe("user@example.com");
        expect(weekly?.used).toBe(97.27);
        expect(weekly?.limit).toBe(100);
        expect(weekly?.display_style).toBe("percent");
        expect(weekly?.reset_at).toBe(Date.parse("2026-09-25T10:03:00Z"));
        expect(weekly?.status).toBe("critical"); // 97.27% 达到 critical 阈值

        // 校验 ondemand 指标
        const ondemand = result.observations.find((o) => o.metric_id === "grok_bot:ondemand");
        expect(ondemand).toBeDefined();
        expect(ondemand?.provider).toBe("grok_bot");
        expect(ondemand?.account_id).toBe("user_123");
        expect(ondemand?.account_label).toBe("user@example.com");
        expect(ondemand?.used).toBe(2.5); // 250 cents = $2.50
        expect(ondemand?.limit).toBe(10); // 1000 cents = $10.00
        expect(ondemand?.display_style).toBe("ratio");
        expect(ondemand?.reset_at).toBe(1791535440000);
    });

    it("clamps percentage and handles missing period usage gracefully", async () => {
        const script = await readFile(join("connectors", "grok_bot", "connector.ts"), "utf8");

        const ctx: ConnectorContext = {
            log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
            http: {
                get_json: () => Promise.reject(new Error("unexpected")),
                post_json(_ep, path) {
                    if (path.includes("GetSandUsageStatus")) {
                        return Promise.resolve({ usagePercent: 125.5 }); // 超出 100%
                    }
                    return Promise.reject(new Error("period service offline"));
                },
                get_raw: () => Promise.reject(new Error("unexpected")),
            },
            files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
            params: {},
            status: ctx_status,
            report_failed_account: vi.fn(),
        };

        const result = await run_connector(test_manifest, script, ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(1);
        const weekly = result.observations[0];
        expect(weekly?.used).toBe(100); // 钳制为 100
        expect(weekly?.account_id).toBe("grok_bot");
        expect(weekly?.account_label).toBe("Grok Bot");
    });

    it("reports failed account when both calls fail", async () => {
        const script = await readFile(join("connectors", "grok_bot", "connector.ts"), "utf8");
        const report_fn = vi.fn();

        const ctx: ConnectorContext = {
            log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
            http: {
                get_json: () => Promise.reject(new Error("unexpected")),
                post_json: () => Promise.reject(new Error("401 Unauthorized")),
                get_raw: () => Promise.reject(new Error("unexpected")),
            },
            files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
            params: {},
            status: ctx_status,
            report_failed_account: report_fn,
        };

        const result = await run_connector(test_manifest, script, ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(0);
        expect(result.failed_accounts).toHaveLength(1);
        expect(result.failed_accounts[0]?.provider).toBe("grok_bot");
        expect(result.failed_accounts[0]?.error).toMatch(/401 Unauthorized/);
    });
});
