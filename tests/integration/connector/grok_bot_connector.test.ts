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

    it("parses weekly observation successfully", async () => {
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
        expect(result.observations).toHaveLength(1);

        // 校验 Header 包含 checksum 等防伪头
        expect(posted_headers).toHaveLength(1);
        const h = posted_headers[0];
        expect(h?.["x-cursor-client-type"]).toBe("sand");
        expect(h?.["x-cursor-checksum"]).toBeDefined();
        expect(typeof h?.["x-cursor-checksum"]).toBe("string");
        expect(h?.["x-cursor-checksum"]?.length).toBeGreaterThan(10);
        expect(h?.["x-request-id"]).toBeDefined();

        // 校验 weekly 指标
        const weekly = result.observations[0];
        expect(weekly).toBeDefined();
        expect(weekly?.metric_id).toBe("grok_bot:weekly");
        expect(weekly?.provider).toBe("grok_bot");
        expect(weekly?.account_id).toBe("user_123");
        expect(weekly?.account_label).toBe("user@example.com");
        expect(weekly?.used).toBe(97.27);
        expect(weekly?.limit).toBe(100);
        expect(weekly?.display_style).toBe("percent");
        expect(weekly?.reset_at).toBe(Date.parse("2026-09-25T10:03:00Z"));
        expect(weekly?.status).toBe("critical"); // 97.27% 达到 critical 阈值
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

    it("throws session expired error on 401 to trigger refresh (A7 / AC-004)", async () => {
        const script = await readFile(join("connectors", "grok_bot", "connector.ts"), "utf8");

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
            report_failed_account: vi.fn(),
        };

        const result = await run_connector(test_manifest, script, ctx);
        // A7: 401 必须抛出错误，使上层 refresh-service 能够捕获并触发 oauth_refresh
        expect(result.error).toMatch(/Grok Bot 会话已失效 \(401\)/);
        expect(result.observations).toHaveLength(0);
    });

    it("reports failed account when service returns non-auth error (500)", async () => {
        const script = await readFile(join("connectors", "grok_bot", "connector.ts"), "utf8");
        const report_fn = vi.fn();

        const ctx: ConnectorContext = {
            log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
            http: {
                get_json: () => Promise.reject(new Error("unexpected")),
                post_json: () => Promise.reject(new Error("500 Internal Server Error")),
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
        expect(result.failed_accounts[0]?.error).toMatch(/500 Internal Server Error/);
    });

    it("falls back to derived account_id when JWT sub is empty or spaces (A13 / t512_code_f002)", async () => {
        const script = await readFile(join("connectors", "grok_bot", "connector.ts"), "utf8");
        const empty_sub_payload = Buffer.from(
            JSON.stringify({ sub: "   ", email: "   " }),
        ).toString("base64url");
        const token = `eyJhbGciOiJIUzI1NiJ9.${empty_sub_payload}.sig`;

        const ctx: ConnectorContext = {
            log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
            http: {
                get_json: () => Promise.reject(new Error("unexpected")),
                post_json: () => Promise.resolve(mock_sand_response),
                get_raw: () => Promise.reject(new Error("unexpected")),
            },
            files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
            params: { ACCESS_TOKEN: token },
            status: ctx_status,
            report_failed_account: vi.fn(),
        };

        const result = await run_connector(test_manifest, script, ctx);
        expect(result.observations).toHaveLength(1);
        const obs = result.observations[0];
        expect(obs?.account_id).not.toBe("");
        expect(obs?.account_id).toMatch(/^grok_bot_/);
        expect(obs?.account_label).toBe("Grok Bot");
    });
});
