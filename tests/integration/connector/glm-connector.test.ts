import { readFile } from "node:fs/promises";
import { ctx_status } from "./_ctx_status";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";

const manifest: Manifest = {
    id: "glm",
    provider: "glm",
    capabilities: ["poll"],
    parameters: [
        {
            name: "API_KEY",
            type: "secret",
            required: true,
            exposeToScript: true,
        },
    ],
    endpoints: { default: "https://open.bigmodel.cn" },
    poll: {
        request: { endpoint: "default", path: "/api/monitor/usage/quota/limit", method: "GET" },
        map: {},
    },
    script: "connector.ts",
};

function create_ctx(limits: unknown[]): ConnectorContext {
    return {
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        http: {
            get_json(endpoint_key, path, opts) {
                expect(endpoint_key).toBe("default");
                expect(path).toBe("/api/monitor/usage/quota/limit");
                expect(opts?.headers?.["Authorization"]).toBe("test-key");
                return Promise.resolve({ data: { limits } });
            },
            post_json: () => Promise.resolve({}),
            get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
        },
        files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
        params: { API_KEY: "test-key" },
        status: ctx_status,
        report_failed_account: () => undefined,
    };
}

describe("glm connector", () => {
    it("maps text 5h and week periods plus tool month to observations", async () => {
        const script = await readFile(join("connectors", "glm", "connector.ts"), "utf8");
        const result = await run_connector(
            manifest,
            script,
            create_ctx([
                {
                    unit: 3,
                    number: 5,
                    name: "文本模型5小时",
                    percentage: 30,
                    nextResetTime: Date.now() + 3600_000,
                },
                {
                    unit: 6,
                    number: 1,
                    name: "文本模型周",
                    percentage: 50,
                    resetTime: Date.now() + 86400_000,
                },
                {
                    unit: 5,
                    number: 1,
                    name: "工具调用月",
                    currentValue: 200,
                    usage: 1000,
                    resetAt: Date.now() + 30 * 86400_000,
                },
                {
                    unit: 9,
                    number: 99,
                    name: "unknown period",
                    percentage: 10,
                },
            ]),
        );

        expect(result.error).toBeNull();
        const ids = result.observations.map((o) => o.metric_id);
        expect(ids).toEqual(["glm:text-5h", "glm:text-week", "glm:tool-month"]);

        const text_5h = result.observations[0];
        expect(text_5h).toEqual(
            expect.objectContaining({
                provider: "glm",
                raw_label: "text-5h",
                normalized_label: "5小时",
                window: "second",
                display_style: "percent",
                used: 30,
                limit: 100,
            }),
        );
        expect(text_5h?.reset_at).not.toBeNull();

        const text_week = result.observations[1];
        expect(text_week).toEqual(
            expect.objectContaining({
                raw_label: "text-week",
                normalized_label: "一周",
            }),
        );

        const tool_month = result.observations[2];
        expect(tool_month).toEqual(
            expect.objectContaining({
                raw_label: "tool-month",
                normalized_label: "MCP 月用量",
                window: "month",
                display_style: "ratio",
                used: 200,
                limit: 1000,
            }),
        );
    });

    it("returns empty when limits array is empty", async () => {
        const script = await readFile(join("connectors", "glm", "connector.ts"), "utf8");
        const result = await run_connector(manifest, script, create_ctx([]));

        expect(result.error).toBeNull();
        expect(result.observations).toEqual([]);
    });

    it("throws when API returns error code", async () => {
        const script = await readFile(join("connectors", "glm", "connector.ts"), "utf8");
        const ctx: ConnectorContext = {
            log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
            http: {
                get_json: () =>
                    Promise.resolve({ code: 401, msg: "令牌已过期或验证不正确", success: false }),
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
            files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
            params: { API_KEY: "test-key" },
            status: ctx_status,
            report_failed_account: () => undefined,
        };
        const result = await run_connector(manifest, script, ctx);

        expect(result.error).not.toBeNull();
        expect(result.error).toContain("令牌已过期");
        expect(result.observations).toEqual([]);
    });

    it("throws when API response lacks limits field", async () => {
        const script = await readFile(join("connectors", "glm", "connector.ts"), "utf8");
        const ctx: ConnectorContext = {
            log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
            http: {
                get_json: () => Promise.resolve({ code: 200, data: {} }),
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
            files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
            params: { API_KEY: "test-key" },
            status: ctx_status,
            report_failed_account: () => undefined,
        };
        const result = await run_connector(manifest, script, ctx);

        expect(result.error).not.toBeNull();
        expect(result.error).toContain("limits");
        expect(result.observations).toEqual([]);
    });

    it("has no unreachable return after throw on missing limits", async () => {
        const script = await readFile(join("connectors", "glm", "connector.ts"), "utf8");
        // After the fix, the line after the throw should NOT be another
        // `if (!Array.isArray(limits)) return [];` — search for duplicates.
        const throw_line_idx = script.indexOf(
            'throw new Error("智谱 API 返回格式异常: 缺少 limits")',
        );
        const after_throw = script.slice(throw_line_idx + 1);
        const nearby = after_throw.slice(0, 200);
        expect(nearby).not.toContain("if (!Array.isArray(limits))");
    });

    it("maps text month period to month window (consistent with tool branch)", async () => {
        const script = await readFile(join("connectors", "glm", "connector.ts"), "utf8");
        const result = await run_connector(
            manifest,
            script,
            create_ctx([
                {
                    unit: 5,
                    number: 1,
                    name: "文本模型月",
                    percentage: 40,
                    nextResetTime: Date.now() + 30 * 86400_000,
                },
            ]),
        );

        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(1);

        const text_month = result.observations[0];
        expect(text_month).toEqual(
            expect.objectContaining({
                raw_label: "text-month",
                window: "month",
            }),
        );
    });
});
