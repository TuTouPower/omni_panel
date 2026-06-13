import { describe, expect, it } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";

const stub_ctx: ConnectorContext = {
    http: {
        get_json() {
            return Promise.resolve({ usage: { month: 50 }, plan: { limit: 1000 } });
        },
        post_json() {
            return Promise.resolve({});
        },
    },
    files: {
        read() {
            return Promise.resolve("");
        },
    },
    params: {},
};

const poll_manifest: Manifest = {
    id: "test",
    provider: "test",
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
                source_instance_id: "test-1",
                account_id: "default",
                account_label: "Test",
                metric_id: "test:monthly",
                name: "Monthly",
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
                source_instance_id: "test-1",
                account_id: "default",
                account_label: "Test",
                metric_id: "test:monthly",
                name: "Monthly",
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

    it("filters out malformed observations with warning", async () => {
        const script = `return [{ provider: "test" }, { valid: "observation" }];`;
        const result = await run_connector(poll_manifest, script, stub_ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toEqual([]);
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
    });
});
