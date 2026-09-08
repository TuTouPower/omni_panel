import { readFile } from "node:fs/promises";
import { ctx_status } from "./_ctx_status";
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
        status: ctx_status,
        report_failed_account: () => undefined,
    };
}

describe("cpa connector", () => {
    it("reports failed_account when upstream returns non-2xx (empty body)", async () => {
        const script = await readFile(join("connectors", "cpa", "connector.ts"), "utf8");
        const ctx = create_ctx();
        ctx.http.post_json = () => Promise.resolve({ status_code: 500, body: {} });
        const result = await run_connector(manifest, script, ctx);

        expect(result.observations).toEqual([]);
        expect(result.failed_accounts).toHaveLength(1);
        expect(result.failed_accounts[0]?.provider).toBe("claude");
    });

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

    it("clamps negative utilization pct to 0 (t361 AC-002)", async () => {
        const script = await readFile(join("connectors", "cpa", "connector.ts"), "utf8");
        const ctx = create_ctx();
        ctx.http.post_json = (_ep, _path, body) => {
            const url = (body as { url?: string }).url ?? "";
            if (url.includes("api.anthropic.com")) {
                return Promise.resolve({
                    status_code: 200,
                    body: {
                        five_hour: { utilization: -0.25, resets_at: "2026-05-26T20:00:00Z" },
                        seven_day: { utilization: 0.5, resets_at: "2026-05-27T00:00:00Z" },
                    },
                });
            }
            return Promise.resolve({ status_code: 404, body: {} });
        };
        const result = await run_connector(manifest, script, ctx);

        expect(result.error).toBeNull();
        // 负 utilization 钳制到 0，不再出现负 used。
        const five_hour = result.observations.find(
            (o) => o.metric_id === "claude:claude-auth:five_hour",
        );
        expect(five_hour?.used).toBe(0);
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

    it("uses the Codex window duration instead of its field position", async () => {
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
                                limit_window_seconds: 604_800,
                                used_percent: 35,
                                reset_at: "2026-06-14T12:00:00Z",
                            },
                            secondary_window: null,
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
        expect(codex).toEqual([
            expect.objectContaining({
                provider: "codex",
                source: "gateway",
                metric_id: "codex:codex-auth:primary_window",
                raw_label: "primary_window",
                normalized_label: "一周",
                window: "day",
                display_style: "percent",
                used: 35,
            }),
        ]);
    });

    it("normalizes string duration_seconds to the matching window (t361 AC-003)", async () => {
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
                                // string 型 duration（非 number）应归一识别为一周。
                                limit_window_seconds: "604800",
                                used_percent: 35,
                                reset_at: "2026-06-14T12:00:00Z",
                            },
                            secondary_window: null,
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
        expect(codex).toEqual([
            expect.objectContaining({
                metric_id: "codex:codex-auth:primary_window",
                normalized_label: "一周",
                window: "day",
                used: 35,
            }),
        ]);
    });

    it("maps the Codex annual-average month duration to a month window", async () => {
        const script = await readFile(join("connectors", "cpa", "connector.ts"), "utf8");
        const ctx = create_ctx();
        ctx.http.get_json = () =>
            Promise.resolve({
                files: [{ name: "auth-codex-1.json", provider: "codex", auth_index: "codex-auth" }],
            });
        ctx.http.post_json = () =>
            Promise.resolve({
                status_code: 200,
                body: {
                    rate_limit: {
                        primary_window: {
                            limit_window_seconds: 2_628_000,
                            used_percent: 42,
                        },
                    },
                },
            });

        const result = await run_connector(manifest, script, {
            ...ctx,
            params: { cpa_mgmt_key: "management-key" },
        });

        expect(result.error).toBeNull();
        expect(result.observations.filter((o) => o.provider === "codex")).toEqual([
            expect.objectContaining({
                metric_id: "codex:codex-auth:primary_window",
                raw_label: "primary_window",
                normalized_label: "一月",
                window: "month",
                used: 42,
            }),
        ]);
    });

    it("keeps an unknown positive Codex duration explicit", async () => {
        const script = await readFile(join("connectors", "cpa", "connector.ts"), "utf8");
        const ctx = create_ctx();
        ctx.http.get_json = () =>
            Promise.resolve({
                files: [{ name: "auth-codex-1.json", provider: "codex", auth_index: "codex-auth" }],
            });
        ctx.http.post_json = () =>
            Promise.resolve({
                status_code: 200,
                body: {
                    rate_limit: {
                        secondary_window: {
                            limit_window_seconds: 86_400,
                            used_percent: 12,
                        },
                    },
                },
            });

        const result = await run_connector(manifest, script, {
            ...ctx,
            params: { cpa_mgmt_key: "management-key" },
        });

        expect(result.error).toBeNull();
        expect(result.observations.filter((o) => o.provider === "codex")).toEqual([
            expect.objectContaining({
                metric_id: "codex:codex-auth:secondary_window",
                raw_label: "secondary_window",
                normalized_label: "窗口 86400 秒",
                window: "second",
                used: 12,
            }),
        ]);
    });

    it("parses camelCase Codex fields with the same window semantics", async () => {
        const script = await readFile(join("connectors", "cpa", "connector.ts"), "utf8");
        const ctx = create_ctx();
        ctx.http.get_json = () =>
            Promise.resolve({
                files: [{ name: "auth-codex-1.json", provider: "codex", auth_index: "codex-auth" }],
            });
        ctx.http.post_json = () =>
            Promise.resolve({
                status_code: 200,
                body: {
                    rateLimit: {
                        primaryWindow: {
                            limitWindowSeconds: 18_000,
                            usedPercent: 25,
                            resetAt: 1_800_000_000,
                        },
                        secondaryWindow: {
                            limitWindowSeconds: 604_800,
                            usedPercent: 50,
                            resetAfterSeconds: 300,
                        },
                    },
                },
            });

        const result = await run_connector(manifest, script, {
            ...ctx,
            params: { cpa_mgmt_key: "management-key" },
        });

        expect(result.error).toBeNull();
        expect(result.observations.filter((o) => o.provider === "codex")).toEqual([
            expect.objectContaining({
                metric_id: "codex:codex-auth:primary_window",
                raw_label: "primary_window",
                normalized_label: "5小时",
                window: "second",
                used: 25,
                reset_at: 1_800_000_000_000,
            }),
            expect.objectContaining({
                metric_id: "codex:codex-auth:secondary_window",
                raw_label: "secondary_window",
                normalized_label: "一周",
                window: "day",
                used: 50,
            }),
        ]);
        expect(typeof result.observations[1]?.reset_at).toBe("number");
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
                            secondary_window: {
                                limit_window_seconds: 0,
                                used_percent: 0,
                                reset_at: null,
                            },
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
        expect(codex[0]).toEqual(
            expect.objectContaining({
                used: 0,
                raw_label: "primary_window",
                normalized_label: "主限额",
                window: "second",
            }),
        );
        expect(codex[1]).toEqual(
            expect.objectContaining({
                used: 0,
                raw_label: "secondary_window",
                normalized_label: "次限额",
                window: "second",
            }),
        );
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
                            primary_window: {
                                limit_window_seconds: 18_000,
                                used_percent: 100,
                                reset_at: null,
                            },
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
        expect(codex[0]).toEqual(
            expect.objectContaining({
                used: 100,
                raw_label: "primary_window",
                normalized_label: "5小时",
                window: "second",
            }),
        );
        expect(codex[1]?.used).toBe(20);
        expect(codex[1]?.raw_label).toBe("secondary_window");
    });

    // t462: 旧“两条 five-hour 观测”（gemini-models / claude-gpt 无窗口共享组）用例整体删除。
    // 语义变更：quota-summary 主路径输出 gemini/claude 各 5h+weekly 共 4 条、全新 id、去 GPT，
    // 无数据时回退模型列表。由下方三组新用例覆盖新语义，不就地改旧预期。
    it("emits gemini/claude five-hour and weekly observations from quota summary", async () => {
        const script = await readFile(join("connectors", "cpa", "connector.ts"), "utf8");
        const ctx = create_ctx();
        const requested_urls: string[] = [];
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
            const typed = body as {
                url?: string;
                data?: string;
                header?: Record<string, string>;
            };
            const url = typed.url ?? "";
            requested_urls.push(url);
            if (url.includes("loadCodeAssist")) {
                return Promise.resolve({
                    status_code: 200,
                    body: { cloudaicompanionProject: "proj-123" },
                });
            }
            if (url.includes("retrieveUserQuotaSummary")) {
                if (!url.includes("daily-cloudcode-pa.googleapis.com/v1internal")) {
                    return Promise.resolve({ status_code: 404, body: {} });
                }
                expect(typed.header?.["User-Agent"]).toContain("antigravity/cli/");
                expect(JSON.parse(typed.data ?? "{}")).toMatchObject({ project: "proj-123" });
                return Promise.resolve({
                    status_code: 200,
                    body: {
                        groups: [
                            {
                                displayName: "Gemini models",
                                buckets: [
                                    {
                                        bucketId: "gemini-5h",
                                        displayName: "5 hour limit",
                                        window: "5h",
                                        remainingFraction: 0.8,
                                        resetTime: "2026-06-15T05:00:00Z",
                                    },
                                    {
                                        bucket_id: "gemini-weekly",
                                        display_name: "Weekly limit",
                                        window: "weekly",
                                        remaining_fraction: 0.6,
                                        reset_time: "2026-06-22T05:00:00Z",
                                    },
                                ],
                            },
                            {
                                display_name: "Claude models",
                                buckets: [
                                    {
                                        bucketId: "claude-5h",
                                        displayName: "5 hour limit",
                                        window: "five_hour",
                                        remainingFraction: 0.5,
                                        resetTime: "2026-06-15T05:20:00Z",
                                    },
                                    {
                                        bucketId: "claude-weekly",
                                        displayName: "Weekly limit",
                                        window: "week",
                                        remainingFraction: 0.7,
                                        resetTime: "2026-06-22T05:20:00Z",
                                    },
                                ],
                            },
                            {
                                displayName: "GPT models",
                                buckets: [
                                    {
                                        bucketId: "gpt-weekly",
                                        displayName: "Weekly limit",
                                        window: "weekly",
                                        remainingFraction: 0.9,
                                        resetTime: "2026-06-22T05:30:00Z",
                                    },
                                ],
                            },
                        ],
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
        // 主路径优先：先 loadCodeAssist 取 project，再 quota-summary；命中后不再回退模型列表。
        expect(requested_urls[0]).toContain("loadCodeAssist");
        expect(requested_urls[1]).toContain("retrieveUserQuotaSummary");
        expect(requested_urls.some((u) => u.includes("fetchAvailableModels"))).toBe(false);
        const antigravity = antigravity_result.observations.filter(
            (o) => o.provider === "antigravity",
        );
        expect(antigravity).toHaveLength(4);
        expect(antigravity).toEqual([
            expect.objectContaining({
                metric_id: "antigravity:ag-auth:gemini_five_hour",
                raw_label: "gemini_five_hour",
                normalized_label: "Gemini 5小时",
                window: "second",
                cycleDurationMs: 18_000_000,
                used: 20,
                limit: 100,
                display_style: "percent",
                reset_at: Date.parse("2026-06-15T05:00:00Z"),
            }),
            expect.objectContaining({
                metric_id: "antigravity:ag-auth:gemini_weekly",
                raw_label: "gemini_weekly",
                normalized_label: "Gemini 一周",
                window: "day",
                cycleDurationMs: 604_800_000,
                used: 40,
                limit: 100,
                display_style: "percent",
                reset_at: Date.parse("2026-06-22T05:00:00Z"),
            }),
            expect.objectContaining({
                metric_id: "antigravity:ag-auth:claude_five_hour",
                raw_label: "claude_five_hour",
                normalized_label: "Claude 5小时",
                window: "second",
                cycleDurationMs: 18_000_000,
                used: 50,
                limit: 100,
                display_style: "percent",
                reset_at: Date.parse("2026-06-15T05:20:00Z"),
            }),
            expect.objectContaining({
                metric_id: "antigravity:ag-auth:claude_weekly",
                raw_label: "claude_weekly",
                normalized_label: "Claude 一周",
                window: "day",
                cycleDurationMs: 604_800_000,
                used: 30,
                limit: 100,
                display_style: "percent",
                reset_at: Date.parse("2026-06-22T05:20:00Z"),
            }),
        ]);
        for (const o of antigravity) {
            expect(o.metric_id).not.toMatch(/gpt/i);
            expect(o.raw_label).not.toMatch(/gpt/i);
            expect(o.normalized_label).not.toMatch(/gpt/i);
        }
    });

    it("falls back to available models without GPT when summary has no usable data", async () => {
        const script = await readFile(join("connectors", "cpa", "connector.ts"), "utf8");
        const ctx = create_ctx();
        const requested_urls: string[] = [];
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
            requested_urls.push(url);
            if (url.includes("loadCodeAssist")) {
                return Promise.resolve({
                    status_code: 200,
                    body: { cloudaicompanionProject: "proj-123" },
                });
            }
            if (url.includes("retrieveUserQuotaSummary")) {
                return Promise.resolve({ status_code: 404, body: {} });
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
                            "gemini-no-quota": {
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
                            "claude-exhausted": {
                                quotaInfo: {
                                    resetTime: "2026-06-15T06:00:00Z",
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
        // summary 三 endpoint 均 404 后才回退模型列表。
        const first_models = requested_urls.findIndex((u) => u.includes("fetchAvailableModels"));
        expect(requested_urls.filter((u) => u.includes("retrieveUserQuotaSummary"))).toHaveLength(
            3,
        );
        expect(first_models).toBeGreaterThan(2);
        const antigravity = antigravity_result.observations.filter(
            (o) => o.provider === "antigravity",
        );
        expect(antigravity).toHaveLength(2);
        expect(antigravity).toEqual([
            expect.objectContaining({
                metric_id: "antigravity:ag-auth:gemini_shared",
                raw_label: "gemini_shared",
                normalized_label: "Gemini",
                window: "second",
                cycleDurationMs: null,
                // 组内最小剩余 0.7（无 quota 字段的 gemini-no-quota 被跳过，不按 0 聚合）。
                used: 30,
                reset_at: Date.parse("2026-06-15T05:10:00Z"),
            }),
            expect.objectContaining({
                metric_id: "antigravity:ag-auth:claude_shared",
                raw_label: "claude_shared",
                normalized_label: "Claude",
                window: "second",
                cycleDurationMs: null,
                // 有 resetTime 但缺 remainingFraction 视为耗尽（0）；GPT 模型不参与聚合。
                used: 100,
                reset_at: Date.parse("2026-06-15T06:00:00Z"),
            }),
        ]);
        for (const o of antigravity) {
            expect(o.metric_id).not.toMatch(/gpt/i);
            expect(o.raw_label).not.toMatch(/gpt/i);
            expect(o.normalized_label).not.toMatch(/gpt/i);
        }
    });

    it("skips summary buckets with missing remainingFraction but keeps explicit zero", async () => {
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
            if (url.includes("retrieveUserQuotaSummary")) {
                return Promise.resolve({
                    status_code: 200,
                    body: {
                        groups: [
                            {
                                displayName: "Gemini models",
                                buckets: [
                                    {
                                        bucketId: "gemini-5h",
                                        displayName: "5 hour limit",
                                        window: "5h",
                                        remainingFraction: 0.8,
                                        resetTime: "2026-06-15T05:00:00Z",
                                    },
                                    {
                                        bucketId: "gemini-weekly",
                                        displayName: "Weekly limit",
                                        window: "weekly",
                                        resetTime: "2026-06-22T05:00:00Z",
                                    },
                                ],
                            },
                            {
                                displayName: "Claude models",
                                buckets: [
                                    {
                                        bucketId: "claude-weekly",
                                        displayName: "Weekly limit",
                                        window: "weekly",
                                        remainingFraction: 0,
                                        resetTime: "2026-06-22T05:20:00Z",
                                    },
                                ],
                            },
                        ],
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
        // 缺字段的 weekly 被跳过；显式 0 保留为 used 100。
        expect(antigravity).toHaveLength(2);
        expect(antigravity).toEqual([
            expect.objectContaining({
                metric_id: "antigravity:ag-auth:gemini_five_hour",
                used: 20,
            }),
            expect.objectContaining({
                metric_id: "antigravity:ag-auth:claude_weekly",
                used: 100,
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
