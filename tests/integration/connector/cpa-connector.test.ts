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
            get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
        },
        files: {
            read() {
                return Promise.resolve("");
            },
            list: () => Promise.resolve([]),
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
                raw_label: "five_hour",
                normalized_label: "5小时",
                window: "second",
                used: 25,
                limit: 100,
                source: "gateway",
            }),
            expect.objectContaining({
                provider: "claude",
                metric_id: "claude:claude-auth:seven_day",
                raw_label: "seven_day",
                normalized_label: "一周",
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

    it("produces Codex observations via CPA api-call", async () => {
        const script = await readFile(join("connectors", "cpa", "connector.ts"), "utf8");
        const ctx = create_ctx();
        ctx.http.get_json = () =>
            Promise.resolve({
                files: [{ name: "auth-codex-1.json", provider: "codex", auth_index: "codex-auth" }],
            });
        ctx.http.post_json = (_ep, _path, body) => {
            const url = (body as { url?: string }).url ?? "";
            if (url.includes("chatgpt.com")) {
                return Promise.resolve({
                    status_code: 200,
                    body: {
                        rate_limit: {
                            primary_window: {
                                used_percent: 35.2,
                                reset_at: "2026-06-14T12:00:00Z",
                            },
                            secondary_window: { used_percent: 12.5, reset_at: null },
                        },
                    },
                });
            }
            return Promise.resolve({ status_code: 404, body: {} });
        };
        const codex_result = await run_connector(manifest, script, {
            ...ctx,
            params: { cpa_mgmt_key: "management-key" },
        });

        expect(codex_result.error).toBeNull();
        const codex = codex_result.observations.filter((o) => o.provider === "codex");
        expect(codex.length).toBe(2);
        expect(codex[0]).toEqual(
            expect.objectContaining({
                provider: "codex",
                source_instance_id: "cpa",
                source: "gateway",
                window: "second",
                display_style: "percent",
                raw_label: "primary_window",
                normalized_label: "5小时",
            }),
        );
        expect(codex[1]).toEqual(
            expect.objectContaining({
                raw_label: "secondary_window",
                normalized_label: "一周",
            }),
        );
        expect(codex[0]?.used).toBeCloseTo(64.8, 0);
        expect(codex[1]?.used).toBeCloseTo(12.5, 0);
    });

    it("shows 0 for unused Codex accounts (used_percent = 1.0)", async () => {
        // Regression: API returns used_percent 1.0 for unused accounts.
        // 5h window: 1.0 = fraction remaining → 100 - 100 = 0
        // week window: 1.0 = fraction used, but to_pct(1.0) = 100 → clamp to 0
        const script = await readFile(join("connectors", "cpa", "connector.ts"), "utf8");
        const ctx = create_ctx();
        ctx.http.get_json = () =>
            Promise.resolve({
                files: [{ name: "auth-codex-1.json", provider: "codex", auth_index: "codex-auth" }],
            });
        ctx.http.post_json = (_ep, _path, body) => {
            const url = (body as { url?: string }).url ?? "";
            if (url.includes("chatgpt.com")) {
                return Promise.resolve({
                    status_code: 200,
                    body: {
                        rate_limit: {
                            primary_window: { used_percent: 1.0, reset_at: null },
                            secondary_window: { used_percent: 1.0, reset_at: null },
                        },
                    },
                });
            }
            return Promise.resolve({ status_code: 404, body: {} });
        };
        const result = await run_connector(manifest, script, {
            ...ctx,
            params: { cpa_mgmt_key: "management-key" },
        });

        expect(result.error).toBeNull();
        const codex = result.observations.filter((o) => o.provider === "codex");
        expect(codex.length).toBe(2);
        expect(codex[0]?.used).toBe(0);
        expect(codex[0]?.raw_label).toBe("primary_window");
        expect(codex[1]?.used).toBe(0);
        expect(codex[1]?.raw_label).toBe("secondary_window");
    });

    it("produces Gemini observations via CPA api-call", async () => {
        const script = await readFile(join("connectors", "cpa", "connector.ts"), "utf8");
        const ctx = create_ctx();
        ctx.http.get_json = () =>
            Promise.resolve({
                files: [
                    {
                        name: "auth-gemini-cli-1.json",
                        provider: "gemini-cli",
                        auth_index: "gem-auth",
                    },
                ],
            });
        ctx.http.post_json = (_ep, _path, body) => {
            const url = (body as { url?: string }).url ?? "";
            if (url.includes("loadCodeAssist")) {
                return Promise.resolve({
                    status_code: 200,
                    body: { cloudaicompanionProject: "proj-123" },
                });
            }
            if (url.includes("retrieveUserQuota")) {
                return Promise.resolve({
                    status_code: 200,
                    body: {
                        buckets: [
                            {
                                modelId: "gemini-2.5-pro",
                                tokenType: "input_tokens",
                                remainingFraction: 0.72,
                                resetTime: "2026-06-15T00:00:00Z",
                            },
                            {
                                modelId: "gemini-2.5-flash",
                                tokenType: "output_tokens",
                                remainingFraction: 0.95,
                                resetTime: null,
                            },
                        ],
                    },
                });
            }
            return Promise.resolve({ status_code: 404, body: {} });
        };
        const gemini_result = await run_connector(manifest, script, {
            ...ctx,
            params: { cpa_mgmt_key: "management-key" },
        });

        expect(gemini_result.error).toBeNull();
        const gemini = gemini_result.observations.filter((o) => o.provider === "gemini");
        expect(gemini.length).toBe(2);
        expect(gemini[0]).toEqual(
            expect.objectContaining({
                provider: "gemini",
                source_instance_id: "cpa",
                source: "gateway",
                display_style: "percent",
                raw_label: "gemini-2.5-pro:input_tokens",
                normalized_label: "2.5 Pro 输入",
            }),
        );
        // remainingFraction 0.72 → used = 28%
        expect(gemini[0]?.used).toBeCloseTo(28, 0);
    });

    it("produces Kimi observations via CPA api-call", async () => {
        const script = await readFile(join("connectors", "cpa", "connector.ts"), "utf8");
        const ctx = create_ctx();
        ctx.http.get_json = () =>
            Promise.resolve({
                files: [{ name: "auth-kimi-1.json", provider: "kimi", auth_index: "kimi-auth" }],
            });
        ctx.http.post_json = (_ep, _path, body) => {
            const url = (body as { url?: string }).url ?? "";
            if (url.includes("kimi.com")) {
                return Promise.resolve({
                    status_code: 200,
                    body: {
                        limits: [
                            {
                                name: "coding_5h",
                                title: "5小时",
                                used: 300,
                                limit: 1000,
                                duration: "5",
                                timeUnit: "hours",
                                reset_at: "2026-06-14T10:00:00Z",
                            },
                        ],
                    },
                });
            }
            return Promise.resolve({ status_code: 404, body: {} });
        };
        const kimi_result = await run_connector(manifest, script, {
            ...ctx,
            params: { cpa_mgmt_key: "management-key" },
        });

        expect(kimi_result.error).toBeNull();
        const kimi = kimi_result.observations.filter((o) => o.provider === "kimi");
        expect(kimi.length).toBe(1);
        expect(kimi[0]).toEqual(
            expect.objectContaining({
                provider: "kimi",
                source_instance_id: "cpa",
                source: "gateway",
                used: 30,
                limit: 100,
                display_style: "percent",
                raw_label: "coding_5h",
                normalized_label: "5 hours",
            }),
        );
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
