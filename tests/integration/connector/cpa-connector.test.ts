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
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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
                                used_percent: 35,
                                reset_at: "2026-06-14T12:00:00Z",
                            },
                            secondary_window: { used_percent: 13, reset_at: null },
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
        expect(codex[0]?.used).toBeCloseTo(35, 0);
        expect(codex[1]?.used).toBeCloseTo(13, 0);
    });

    it("shows 0 for unused Codex accounts (used_percent = 0)", async () => {
        // API returns used_percent 0 for unused accounts (0% used).
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
                            primary_window: { used_percent: 0, reset_at: null },
                            secondary_window: { used_percent: 0, reset_at: null },
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

    it("shows 100 for exhausted 5h window (used_percent = 100)", async () => {
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
                            primary_window: { used_percent: 100, reset_at: null },
                            secondary_window: { used_percent: 20, reset_at: null },
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
        expect(codex[0]?.used).toBe(100);
        expect(codex[0]?.raw_label).toBe("primary_window");
        expect(codex[1]?.used).toBe(20);
        expect(codex[1]?.raw_label).toBe("secondary_window");
    });

    it("produces two Antigravity five-hour observations via CPA api-call", async () => {
        const script = await readFile(join("connectors", "cpa", "connector.ts"), "utf8");
        const ctx = create_ctx();
        ctx.http.get_json = () =>
            Promise.resolve({
                files: [
                    {
                        name: "auth-antigravity-1.json",
                        provider: "antigravity",
                        auth_index: "ag-auth",
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
            if (url.includes("fetchAvailableModels")) {
                return Promise.resolve({
                    status_code: 200,
                    body: {
                        models: {
                            "gemini-3-flash": {
                                quotaInfo: {
                                    remainingFraction: 0.8,
                                    resetTime: "2026-06-15T05:00:00Z",
                                },
                                apiProvider: "API_PROVIDER_GOOGLE_GEMINI",
                                modelProvider: "MODEL_PROVIDER_GOOGLE",
                            },
                            "gemini-pro-agent": {
                                quotaInfo: {
                                    remainingFraction: 0.7,
                                    resetTime: "2026-06-15T05:10:00Z",
                                },
                                apiProvider: "API_PROVIDER_GOOGLE_GEMINI",
                                modelProvider: "MODEL_PROVIDER_GOOGLE",
                            },
                            "claude-sonnet-4-6": {
                                quotaInfo: {
                                    remainingFraction: 0.6,
                                    resetTime: "2026-06-15T05:20:00Z",
                                },
                                apiProvider: "API_PROVIDER_ANTHROPIC_VERTEX",
                                modelProvider: "MODEL_PROVIDER_ANTHROPIC",
                            },
                            "gpt-oss-120b-medium": {
                                quotaInfo: {
                                    remainingFraction: 0.9,
                                    resetTime: "2026-06-15T05:30:00Z",
                                },
                                apiProvider: "API_PROVIDER_OPENAI_VERTEX",
                                modelProvider: "MODEL_PROVIDER_OPENAI",
                            },
                            "ambiguous-provider-name": {
                                quotaInfo: {
                                    remainingFraction: 0.1,
                                    resetTime: "2026-06-15T05:40:00Z",
                                },
                                apiProvider: "API_PROVIDER_VENDOR_GOOGLE_GEMINI_ANTHROPIC",
                                modelProvider: "MODEL_PROVIDER_VENDOR_OPENAI_ALIAS",
                            },
                        },
                    },
                });
            }
            return Promise.resolve({ status_code: 404, body: {} });
        };
        const antigravity_result = await run_connector(manifest, script, {
            ...ctx,
            params: { cpa_mgmt_key: "management-key" },
        });

        expect(antigravity_result.error).toBeNull();
        const antigravity = antigravity_result.observations.filter(
            (o) => o.provider === "antigravity",
        );
        expect(antigravity).toHaveLength(2);
        expect(antigravity).toEqual([
            expect.objectContaining({
                metric_id: "antigravity:ag-auth:gemini-models",
                raw_label: "gemini-models",
                normalized_label: "Gemini Models",
                window: "second",
                used: 30,
                reset_at: Date.parse("2026-06-15T05:10:00Z"),
            }),
            expect.objectContaining({
                metric_id: "antigravity:ag-auth:claude-gpt",
                raw_label: "claude-gpt",
                normalized_label: "Claude/GPT",
                window: "second",
                used: 40,
                reset_at: Date.parse("2026-06-15T05:20:00Z"),
            }),
        ]);
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
