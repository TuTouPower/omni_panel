import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";

const manifest: Manifest = {
    id: "claude",
    provider: "claude",
    capabilities: ["local"],
    parameters: [
        {
            name: "data_dir",
            type: "string",
            required: false,
            exposeToScript: true,
            default: "~/.claude",
        },
    ],
    local: { paths: ["~/.claude/.credentials.json"] },
    script: "connector.ts",
};

function create_ctx(): ConnectorContext {
    return {
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        http: {
            get_json(endpoint_key: string, path: string, opts) {
                expect(endpoint_key).toBe("anthropic");
                expect(path).toBe("/api/oauth/usage");
                expect(opts?.headers?.["Authorization"]).toBe("Bearer fake-token");
                return Promise.resolve({
                    five_hour: { utilization: 25.5, resets_at: "2026-06-01T00:00:00Z" },
                    seven_day: { utilization: 40, resets_at: "2026-06-08T00:00:00Z" },
                });
            },
            post_json() {
                return Promise.resolve({});
            },
            get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
        },
        files: {
            read(path_pattern: string) {
                expect(path_pattern).toBe("~/.claude/.credentials.json");
                return Promise.resolve(
                    JSON.stringify({ claudeAiOauth: { accessToken: "fake-token" } }),
                );
            },
            list: () => Promise.resolve([]),
        },
        params: {},
        report_failed_account: () => undefined,
    };
}

describe("claude connector", () => {
    it("reads local credentials and returns OAuth usage observations", async () => {
        const script = await readFile(join("connectors", "claude", "connector.ts"), "utf8");
        const result = await run_connector(manifest, script, create_ctx());

        expect(result.error).toBeNull();
        expect(result.observations).toEqual([
            expect.objectContaining({
                provider: "claude",
                account_id: "claude",
                metric_id: "claude:five_hour",
                raw_label: "five_hour",
                normalized_label: "5小时",
                window: "second",
                used: 25.5,
                limit: 100,
                source: "local",
            }),
            expect.objectContaining({
                provider: "claude",
                metric_id: "claude:seven_day",
                raw_label: "seven_day",
                normalized_label: "一周",
                window: "day",
                used: 40,
                limit: 100,
                source: "local",
            }),
        ]);
    });

    it("returns no observations when credentials are missing", async () => {
        const script = await readFile(join("connectors", "claude", "connector.ts"), "utf8");
        const ctx = create_ctx();
        ctx.files.read = () => Promise.resolve("{}");

        const result = await run_connector(manifest, script, ctx);

        expect(result.error).toBeNull();
        expect(result.observations).toEqual([]);
    });

    it("throws when API returns neither five_hour nor seven_day", async () => {
        const script = await readFile(join("connectors", "claude", "connector.ts"), "utf8");
        const ctx = create_ctx();
        ctx.http.get_json = () => Promise.resolve({ error: "invalid token" });

        const result = await run_connector(manifest, script, ctx);

        expect(result.error).not.toBeNull();
        expect(result.error).toContain("five_hour");
        expect(result.observations).toEqual([]);
    });
});
