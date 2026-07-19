import { describe, expect, it } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";

const stub_ctx: ConnectorContext = {
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    http: {
        get_json() {
            return Promise.resolve({ usage: { month: 50 }, plan: { limit: 1000 } });
        },
        post_json() {
            return Promise.resolve({});
        },
        get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
    },
    files: {
        read() {
            return Promise.resolve("");
        },
        list: () => Promise.resolve([]),
    },
    params: {},
    report_failed_account: () => undefined,
};

const poll_manifest: Manifest = {
    id: "test",
    provider: "claude",
    capabilities: ["poll"],
    parameters: [],
    script: "connector.ts",
    poll: {
        request: { endpoint: "default", path: "/usage", method: "GET" },
        map: { used: "$.usage.month", limit: "$.plan.limit", window: "month" },
    },
};

describe("connector-runtime", () => {
    it("returns error when no script in manifest", async () => {
        const no_script_manifest = { ...poll_manifest, script: undefined };
        const result = await run_connector(no_script_manifest, "", stub_ctx);
        expect(result.error).toContain("No script");
    });

    it("runs script and returns observations", async () => {
        const script = `
            const data = await ctx.http.get_json("default", "/usage");
            return [{
                provider: "test",
                account_id: "default",
                account_label: "Test",
                metric_id: "test:monthly",
                raw_label: "monthly",
                normalized_label: "Monthly",
                window: "month",
                used: data.usage.month,
                limit: data.plan.limit,
                display_style: "ratio",
                reset_at: null,
                status: "normal",
                observed_at: 1000,
                source: "poll",
                stale: false,
                last_error: null,
            }];
        `;
        const result = await run_connector(poll_manifest, script, stub_ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(1);
        expect(result.observations[0]?.used).toBe(50);
    });

    it("transpiles TypeScript connector scripts", async () => {
        const script = `
            interface UsageResponse { usage: { month: number }; plan: { limit: number } }
            const data = await ctx.http.get_json("default", "/usage") as UsageResponse;
            const used: number = data.usage.month;
            return [{
                provider: "test",
                account_id: "default",
                account_label: "Test",
                metric_id: "test:monthly",
                raw_label: "monthly",
                normalized_label: "Monthly",
                window: "month",
                used,
                limit: data.plan.limit,
                display_style: "ratio",
                reset_at: null,
                status: "normal",
                observed_at: 1000,
                source: "poll",
                stale: false,
                last_error: null,
            }];
        `;
        const result = await run_connector(poll_manifest, script, stub_ctx);
        expect(result.error).toBeNull();
        expect(result.observations[0]?.used).toBe(50);
    });

    it("rejects runtime imports in connector scripts", async () => {
        const result = await run_connector(
            poll_manifest,
            `import { readFile } from "node:fs/promises";\nreturn [];`,
            stub_ctx,
        );
        expect(result.error).toContain("Connector scripts cannot use import or export statements");
    });

    it("rejects scripts that try common vm sandbox-escape patterns (D8)", async () => {
        const escape_payloads = [
            `(0, eval)("this")`,
            `return Function("return process")()`,
            `return ({}).constructor.constructor("return process")()`,
            `return process.binding("fs")`,
        ];
        for (const payload of escape_payloads) {
            const result = await run_connector(poll_manifest, payload, stub_ctx);
            expect(result.error).toMatch(/sandbox escape/i);
        }
    });

    it("filters out malformed observations with warning", async () => {
        const { addTransport } = await import("../../../src/shared/lib/logger");
        const warn_messages: string[] = [];
        const remove = addTransport({
            write(level, _module, message) {
                if (level === "warn") {
                    warn_messages.push(message);
                }
            },
        });

        const script = `return [{ provider: "test" }, { valid: "observation" }];`;
        const result = await run_connector(poll_manifest, script, stub_ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toEqual([]);
        expect(warn_messages.some((m) => m.includes("Skipping invalid observation"))).toBe(true);

        remove();
    });

    it("returns error when script throws", async () => {
        const script = `throw new Error("boom");`;
        const result = await run_connector(poll_manifest, script, stub_ctx);
        expect(result.error).toBe("boom");
    });

    it("returns error when script times out", async () => {
        const script = `while(true){}`;
        const result = await run_connector(poll_manifest, script, stub_ctx, 100);
        expect(result.error).not.toBeNull();
        expect(result.error?.toLowerCase()).toContain("timeout");
    });

    it("returns timeout error when async script exceeds timeout", async () => {
        const slow_ctx: ConnectorContext = {
            ...stub_ctx,
            http: {
                get_json() {
                    return new Promise(() => {
                        // never resolves; simulates an in-flight HTTP request that leaks
                    });
                },
                post_json() {
                    return Promise.resolve({});
                },
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
        };
        const script = `
            await ctx.http.get_json("default", "/usage");
            return [];
        `;
        const result = await run_connector(poll_manifest, script, slow_ctx, 100);
        expect(result.error).not.toBeNull();
        expect(result.error?.toLowerCase()).toContain("timeout");
    });

    it("prevents scripts from mutating ctx.params", async () => {
        const ctx_with_params: ConnectorContext = {
            ...stub_ctx,
            params: { token: "secret", region: "us" },
        };
        const script = `
            ctx.params.token = "hacked";
            ctx.params.injected = "new";
            return [];
        `;
        const result = await run_connector(poll_manifest, script, ctx_with_params);
        expect(result.error).toBeNull();
        expect(ctx_with_params.params["token"]).toBe("secret");
        expect(ctx_with_params.params["injected"]).toBeUndefined();
    });

    it("collects failed account reports from ctx.report_failed_account", async () => {
        // P0-2: 脚本内部逐账号 try/catch，失败时调 ctx.report_failed_account
        // 上报。runtime 收集到 failed_accounts 数组随 run_connector 返回，
        // 供 refresh-service 决定标 stale 的账号范围。
        const script = `
            ctx.report_failed_account("claude", "acc-1", "Account 1", "HTTP 500");
            ctx.report_failed_account("kimi", "acc-2", "Account 2", "timeout");
            return [];
        `;
        const result = await run_connector(poll_manifest, script, stub_ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toEqual([]);
        expect(result.failed_accounts).toEqual([
            {
                provider: "claude",
                account_id: "acc-1",
                account_label: "Account 1",
                error: "HTTP 500",
            },
            { provider: "kimi", account_id: "acc-2", account_label: "Account 2", error: "timeout" },
        ]);
    });

    it("returns empty failed_accounts when script does not report any", async () => {
        const script = `return [];`;
        const result = await run_connector(poll_manifest, script, stub_ctx);
        expect(result.error).toBeNull();
        expect(result.failed_accounts).toEqual([]);
    });
});
