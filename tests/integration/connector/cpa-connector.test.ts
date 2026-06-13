import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";

const manifest: Manifest = {
    id: "cpa",
    provider: "cpa",
    capabilities: ["poll"],
    parameters: [
        {
            name: "cpa_mgmt_key",
            type: "secret",
            required: true,
            exposeToScript: true,
        },
        {
            name: "monitor_claude",
            type: "string",
            required: false,
            exposeToScript: true,
            default: "true",
        },
        {
            name: "monitor_gemini",
            type: "string",
            required: false,
            exposeToScript: true,
            default: "true",
        },
        {
            name: "monitor_kimi",
            type: "string",
            required: false,
            exposeToScript: true,
            default: "true",
        },
    ],
    endpoints: { default: "http://127.0.0.1:17863" },
    poll: {
        request: { endpoint: "default", path: "/v0/management/auth-files", method: "GET" },
        map: {},
    },
    script: "connector.ts",
};

function create_ctx(): ConnectorContext {
    const requests: string[] = [];
    return {
        http: {
            get_json(endpoint_key: string, path: string, opts) {
                requests.push(`GET ${path} ${opts?.headers?.["Authorization"] ?? ""}`);
                expect(endpoint_key).toBe("default");
                expect(path).toBe("/v0/management/auth-files");
                expect(opts?.headers?.["Authorization"]).toBe("Bearer management-key");
                return Promise.resolve({
                    files: [
                        {
                            name: "auth-11111111-user@example.com-pro.json",
                            provider: "claude",
                            auth_index: "claude-auth",
                        },
                        {
                            name: "auth-disabled@example.com.json",
                            provider: "claude",
                            auth_index: "disabled-auth",
                            disabled: true,
                        },
                    ],
                });
            },
            post_json(endpoint_key: string, path: string, body, opts) {
                requests.push(`POST ${path} ${opts?.headers?.["Authorization"] ?? ""}`);
                expect(endpoint_key).toBe("default");
                expect(path).toBe("/v0/management/api-call");
                expect(opts?.headers?.["Authorization"]).toBe("Bearer management-key");
                expect(body).toMatchObject({
                    method: "GET",
                    url: "https://api.anthropic.com/api/oauth/usage",
                    auth_index: "claude-auth",
                });
                return Promise.resolve({
                    status_code: 200,
                    body: {
                        five_hour: { utilization: 0.25, resets_at: "2026-05-26T20:00:00Z" },
                        seven_day: { utilization: 0.5, resets_at: "2026-05-27T00:00:00Z" },
                    },
                });
            },
        },
        files: {
            read() {
                return Promise.resolve("");
            },
        },
        params: { cpa_mgmt_key: "management-key", monitor_claude: "true" },
    };
}

describe("cpa connector", () => {
    it("fetches enabled Claude accounts through CPA manager", async () => {
        const script = await readFile(join("connectors", "cpa", "connector.ts"), "utf8");
        const result = await run_connector(manifest, script, create_ctx());

        expect(result.error).toBeNull();
        expect(result.observations).toEqual([
            expect.objectContaining({
                provider: "claude",
                source_instance_id: "cpa",
                account_id: "claude-auth",
                account_label: "user@example.com",
                metric_id: "claude:claude-auth:five_hour",
                name: "Claude (user@example.com) · 5小时",
                window: "second",
                used: 25,
                limit: 100,
                source: "gateway",
            }),
            expect.objectContaining({
                provider: "claude",
                metric_id: "claude:claude-auth:seven_day",
                name: "Claude (user@example.com) · 每周",
                window: "day",
                used: 50,
                limit: 100,
                source: "gateway",
            }),
        ]);
    });

    it("returns empty observations when management key is missing", async () => {
        const script = await readFile(join("connectors", "cpa", "connector.ts"), "utf8");
        const ctx = create_ctx();
        ctx.params["cpa_mgmt_key"] = "";

        const result = await run_connector(manifest, script, ctx);

        expect(result.error).toBeNull();
        expect(result.observations).toEqual([]);
    });

    it("skips claude accounts when monitor_claude is false", async () => {
        const script = await readFile(join("connectors", "cpa", "connector.ts"), "utf8");
        const ctx = create_ctx();
        ctx.params["monitor_claude"] = "false";

        const result = await run_connector(manifest, script, ctx);

        expect(result.error).toBeNull();
        expect(result.observations).toEqual([]);
    });

    it("does not crash on non-claude auth files when monitor switches are on", async () => {
        const script = await readFile(join("connectors", "cpa", "connector.ts"), "utf8");
        const ctx = create_ctx();
        ctx.http.get_json = () =>
            Promise.resolve({
                files: [
                    {
                        name: "auth-gemini-1.json",
                        provider: "gemini",
                        auth_index: "gemini-auth",
                    },
                    {
                        name: "auth-kimi-1.json",
                        provider: "kimi",
                        auth_index: "kimi-auth",
                    },
                ],
            });

        const result = await run_connector(manifest, script, ctx);

        expect(result.error).toBeNull();
    });
});
