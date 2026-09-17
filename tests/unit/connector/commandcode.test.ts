import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import { load_manifest } from "../../../src/main/core/connector/manifest-loader";
import type { ConnectorContext, HttpOpts } from "../../../src/main/core/connector/host-io";
import { ctx_status } from "../../integration/connector/_ctx_status";
import { ADD_COMMON_SERVICES } from "../../../src/renderer/lib/common-services";
import { PROVIDER_LABELS, PROVIDER_ORDER } from "../../../src/renderer/lib/provider-usage";
import { usageProviderSchema } from "../../../src/shared/schemas/plugin-output";

const connector_dir = join(process.cwd(), "connectors", "commandcode");

async function load_connector() {
    const manifest = await load_manifest(connector_dir);
    const script = await readFile(join(connector_dir, "connector.ts"), "utf8");
    if (!manifest) throw new Error("manifest missing");
    return { manifest, script };
}

function create_mock_ctx(
    get_json_handler: (
        endpoint: string,
        path: string,
        opts?: HttpOpts,
    ) => Promise<unknown> | Record<string, unknown>,
    params: Record<string, string> = { API_KEY: "user_test_secret_12345" },
): ConnectorContext {
    return {
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        http: {
            get_json: vi.fn((endpoint: string, path: string, opts?: HttpOpts) =>
                Promise.resolve(get_json_handler(endpoint, path, opts)),
            ),
            post_json: vi.fn(() => Promise.resolve({})),
            get_raw: vi.fn(() => Promise.resolve({ status: 200, headers: {}, body: "" })),
        },
        files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
        params,
        status: ctx_status,
        report_failed_account: vi.fn(),
    };
}

describe("Command Code connector", () => {
    describe("AC-001: Manifest and Service Registration", () => {
        it("manifest loads successfully with valid schema and poll capability", async () => {
            const { manifest } = await load_connector();
            expect(manifest.id).toBe("commandcode");
            expect(manifest.provider).toBe("commandcode");
            expect(manifest.capabilities).toContain("poll");
            expect(manifest.parameters).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ name: "API_KEY", type: "secret", required: true }),
                    expect.objectContaining({ name: "API_BASE", type: "string", required: false }),
                ]),
            );
        });

        it("registered in common services and renderer provider configuration", () => {
            expect(ADD_COMMON_SERVICES.some((s) => s.id === "commandcode")).toBe(true);
            expect(PROVIDER_LABELS["commandcode"]).toBe("Command Code");
            expect(PROVIDER_ORDER).toContain("commandcode");
            expect(usageProviderSchema.safeParse("commandcode").success).toBe(true);
        });
    });

    describe("AC-002: Request Headers and Cloudflare Bypass", () => {
        it("sends Bearer token and curl/8.7.1 User-Agent header", async () => {
            const { manifest, script } = await load_connector();
            const captured_headers: Record<string, string>[] = [];

            const ctx = create_mock_ctx((_endpoint, path, opts) => {
                if (opts?.headers) {
                    captured_headers.push(opts.headers);
                }
                if (path === "/alpha/whoami") {
                    return { user: { userName: "testuser", email: "testuser@example.com" } };
                }
                if (path === "/alpha/billing/credits") {
                    return {
                        credits: { monthlyCredits: 25.5, belowThreshold: false },
                        windowLimits: {
                            fiveHour: { used: 1.5, cap: 10, exceeded: false },
                            weekly: { used: 12.0, cap: 50, resetAt: "2026-09-20T00:00:00Z" },
                        },
                    };
                }
                if (path === "/alpha/billing/subscriptions") {
                    return {
                        data: {
                            planId: "individual-pro",
                            currentPeriodEnd: "2026-10-01T00:00:00Z",
                        },
                    };
                }
                return {};
            });

            await run_connector(manifest, script, ctx);

            expect(captured_headers.length).toBeGreaterThanOrEqual(2);
            for (const headers of captured_headers) {
                expect(headers["Authorization"]).toBe("Bearer user_test_secret_12345");
                expect(headers["User-Agent"]).toBe("curl/8.7.1");
                expect(headers["Accept"]).toBe("application/json");
            }
        });
    });

    describe("AC-003: Quota and Window Metrics Parsing", () => {
        it("produces monthly credits, five_hour window, and weekly window observations", async () => {
            const { manifest, script } = await load_connector();

            const ctx = create_mock_ctx((_endpoint, path) => {
                if (path === "/alpha/whoami") {
                    return { user: { id: "u_999", userName: "testuser", name: "Test User" } };
                }
                if (path === "/alpha/billing/credits") {
                    return {
                        credits: { monthlyCredits: 18.25, belowThreshold: false },
                        windowLimits: {
                            fiveHour: { used: 3.5, cap: 10, exceeded: false },
                            weekly: { used: 25.0, cap: 50, resetAt: 1789736400000 },
                        },
                    };
                }
                if (path === "/alpha/billing/subscriptions") {
                    return {
                        data: {
                            planId: "individual-pro",
                            currentPeriodEnd: "2026-10-01T12:00:00Z",
                        },
                    };
                }
                return {};
            });

            const result = await run_connector(manifest, script, ctx);
            expect(result.error).toBeNull();
            expect(result.observations).toHaveLength(3);

            // 1. Monthly observation
            const monthly = result.observations.find((o) => o.metric_id === "commandcode:monthly");
            expect(monthly).toBeDefined();
            expect(monthly?.raw_label).toBe("monthly");
            expect(monthly?.normalized_label).toBe("月额度");
            expect(monthly?.window).toBe("month");
            // t498 语义修正：旧测试将 monthlyCredits（实际为剩余额度 18.25）误断言为 used 且断言 display_style 为 "ratio"；
            // 现按 AC-001/AC-002 覆盖实际已消耗量（30 - 18.25 = 11.75）与 "percent" 百分比风格
            expect(monthly?.used).toBe(11.75);
            expect(monthly?.limit).toBe(30); // individual-pro cap
            expect(monthly?.display_style).toBe("percent");
            expect(monthly?.account_label).toBe("testuser (PRO)");
            expect(monthly?.status).toBe("normal");
            expect(monthly?.reset_at).toBe(Date.parse("2026-10-01T12:00:00Z"));

            // 2. 5-Hour observation
            const five_hour = result.observations.find(
                (o) => o.metric_id === "commandcode:five_hour",
            );
            expect(five_hour).toBeDefined();
            expect(five_hour?.raw_label).toBe("five_hour");
            expect(five_hour?.normalized_label).toBe("5小时");
            expect(five_hour?.window).toBe("second");
            expect(five_hour?.cycleDurationMs).toBe(18_000_000);
            expect(five_hour?.used).toBe(3.5);
            expect(five_hour?.limit).toBe(10);
            expect(five_hour?.display_style).toBe("percent");
            expect(five_hour?.status).toBe("normal");

            // 3. Weekly observation
            const weekly = result.observations.find((o) => o.metric_id === "commandcode:weekly");
            expect(weekly).toBeDefined();
            expect(weekly?.raw_label).toBe("weekly");
            expect(weekly?.normalized_label).toBe("一周");
            expect(weekly?.window).toBe("week");
            expect(weekly?.cycleDurationMs).toBe(604_800_000);
            expect(weekly?.used).toBe(25.0);
            expect(weekly?.limit).toBe(50);
            expect(weekly?.display_style).toBe("percent");
            expect(weekly?.reset_at).toBe(1789736400000);
            expect(weekly?.status).toBe("normal");
        });

        it("correctly flags exceeded 5-hour window as critical status", async () => {
            const { manifest, script } = await load_connector();

            const ctx = create_mock_ctx((_endpoint, path) => {
                if (path === "/alpha/billing/credits") {
                    return {
                        credits: { monthlyCredits: 5, belowThreshold: true },
                        windowLimits: {
                            fiveHour: { used: 10.5, cap: 10, exceeded: true },
                        },
                    };
                }
                return {};
            });

            const result = await run_connector(manifest, script, ctx);
            const five_hour = result.observations.find(
                (o) => o.metric_id === "commandcode:five_hour",
            );
            expect(five_hour?.status).toBe("critical");

            const monthly = result.observations.find((o) => o.metric_id === "commandcode:monthly");
            expect(monthly?.status).toBe("warning"); // belowThreshold is true
        });
    });

    describe("AC-004: Error Handling and Abnormal Observations", () => {
        it("returns an abnormal observation when API responds with 401 Unauthorized", async () => {
            const { manifest, script } = await load_connector();

            const ctx = create_mock_ctx(() =>
                Promise.reject(new Error("HTTP 401: request failed (Unauthorized)")),
            );

            const result = await run_connector(manifest, script, ctx);
            expect(result.observations).toHaveLength(1);
            const err_obs = result.observations[0];
            expect(err_obs).toBeDefined();
            if (!err_obs) return;
            expect(err_obs.status).toBe("critical");
            expect(err_obs.stale).toBe(true);
            expect(err_obs.used).toBeNull();
            expect(err_obs.limit).toBeNull();
            expect(err_obs.last_error).toContain("HTTP 401");
        });

        it("returns an abnormal observation on network timeout", async () => {
            const { manifest, script } = await load_connector();

            const ctx = create_mock_ctx(() =>
                Promise.reject(new Error("Request timed out after 15000ms")),
            );

            const result = await run_connector(manifest, script, ctx);
            expect(result.observations).toHaveLength(1);
            const err_obs = result.observations[0];
            expect(err_obs).toBeDefined();
            if (!err_obs) return;
            expect(err_obs.status).toBe("critical");
            expect(err_obs.stale).toBe(true);
            expect(err_obs.last_error).toContain("Request timed out");
        });

        it("throws error when API_KEY is missing", async () => {
            const { manifest, script } = await load_connector();

            const ctx = create_mock_ctx(() => ({}), { API_KEY: "" });
            const result = await run_connector(manifest, script, ctx);
            expect(result.error).toContain("Missing required secret: API_KEY");
        });
    });

    describe("t498: Monthly Quota Inverted Fix (AC-001 ~ AC-004)", () => {
        it("AC-001 & AC-002: calculates used as monthly_cap - monthly_remaining with percent display_style and reset_at", async () => {
            const { manifest, script } = await load_connector();
            const ctx = create_mock_ctx((_endpoint, path) => {
                if (path === "/alpha/whoami") {
                    return { user: { userName: "goat_user" } };
                }
                if (path === "/alpha/billing/credits") {
                    return {
                        credits: { monthlyCredits: 56.16, belowThreshold: false },
                    };
                }
                if (path === "/alpha/billing/subscriptions") {
                    return {
                        data: {
                            planId: "individual-goat",
                            currentPeriodEnd: "2026-10-13T00:00:00Z",
                        },
                    };
                }
                return {};
            });

            const result = await run_connector(manifest, script, ctx);
            expect(result.error).toBeNull();
            const monthly = result.observations.find((o) => o.metric_id === "commandcode:monthly");
            expect(monthly).toBeDefined();
            // Cap is 70, remaining is 56.16 => used = 70 - 56.16 = 13.84
            expect(monthly?.used).toBe(13.84);
            expect(monthly?.limit).toBe(70);
            expect(monthly?.display_style).toBe("percent");
            expect(monthly?.reset_at).toBe(Date.parse("2026-10-13T00:00:00Z"));
            expect(monthly?.status).toBe("normal");
        });

        it("AC-001: clamps used to 0 if monthly_remaining exceeds monthly_cap", async () => {
            const { manifest, script } = await load_connector();
            const ctx = create_mock_ctx((_endpoint, path) => {
                if (path === "/alpha/billing/credits") {
                    return { credits: { monthlyCredits: 75.0, belowThreshold: false } };
                }
                if (path === "/alpha/billing/subscriptions") {
                    return { data: { planId: "individual-goat" } };
                }
                return {};
            });

            const result = await run_connector(manifest, script, ctx);
            const monthly = result.observations.find((o) => o.metric_id === "commandcode:monthly");
            expect(monthly?.used).toBe(0);
            expect(monthly?.limit).toBe(70);
        });

        it("AC-003: maps status according to consumed ratio thresholds (normal, warning at 75%, critical at 90%, and belowThreshold)", async () => {
            const { manifest, script } = await load_connector();

            // Case 1: Low consumption (cap 40, remaining 32 => used 8 => 20% => normal)
            const ctxNormal = create_mock_ctx((_endpoint, path) => {
                if (path === "/alpha/billing/credits") {
                    return { credits: { monthlyCredits: 32, belowThreshold: false } };
                }
                if (path === "/alpha/billing/subscriptions") {
                    return { data: { planId: "teams-pro" } }; // cap: 40
                }
                return {};
            });
            const resNormal = await run_connector(manifest, script, ctxNormal);
            expect(
                resNormal.observations.find((o) => o.metric_id === "commandcode:monthly")?.status,
            ).toBe("normal");

            // Case 2: Warning consumption (cap 40, remaining 8 => used 32 => 80% >= 75% => warning)
            const ctxWarning = create_mock_ctx((_endpoint, path) => {
                if (path === "/alpha/billing/credits") {
                    return { credits: { monthlyCredits: 8, belowThreshold: false } };
                }
                if (path === "/alpha/billing/subscriptions") {
                    return { data: { planId: "teams-pro" } };
                }
                return {};
            });
            const resWarning = await run_connector(manifest, script, ctxWarning);
            expect(
                resWarning.observations.find((o) => o.metric_id === "commandcode:monthly")?.status,
            ).toBe("warning");

            // Case 3: Critical consumption (cap 40, remaining 2 => used 38 => 95% >= 90% => critical)
            const ctxCritical = create_mock_ctx((_endpoint, path) => {
                if (path === "/alpha/billing/credits") {
                    return { credits: { monthlyCredits: 2, belowThreshold: false } };
                }
                if (path === "/alpha/billing/subscriptions") {
                    return { data: { planId: "teams-pro" } };
                }
                return {};
            });
            const resCritical = await run_connector(manifest, script, ctxCritical);
            expect(
                resCritical.observations.find((o) => o.metric_id === "commandcode:monthly")?.status,
            ).toBe("critical");

            // Case 4: belowThreshold is true => at least warning even if consumed ratio is low (used 8/40 = 20%)
            const ctxBelowThreshold = create_mock_ctx((_endpoint, path) => {
                if (path === "/alpha/billing/credits") {
                    return { credits: { monthlyCredits: 32, belowThreshold: true } };
                }
                if (path === "/alpha/billing/subscriptions") {
                    return { data: { planId: "teams-pro" } };
                }
                return {};
            });
            const resBelowThreshold = await run_connector(manifest, script, ctxBelowThreshold);
            expect(
                resBelowThreshold.observations.find((o) => o.metric_id === "commandcode:monthly")
                    ?.status,
            ).toBe("warning");

            // Case 5: belowThreshold is true with critical consumption => remains critical
            const ctxBelowThresholdCrit = create_mock_ctx((_endpoint, path) => {
                if (path === "/alpha/billing/credits") {
                    return { credits: { monthlyCredits: 2, belowThreshold: true } };
                }
                if (path === "/alpha/billing/subscriptions") {
                    return { data: { planId: "teams-pro" } };
                }
                return {};
            });
            const resBelowThresholdCrit = await run_connector(
                manifest,
                script,
                ctxBelowThresholdCrit,
            );
            expect(
                resBelowThresholdCrit.observations.find(
                    (o) => o.metric_id === "commandcode:monthly",
                )?.status,
            ).toBe("critical");
        });

        it("AC-004: safely degrades to ratio display with raw balance when monthly_cap is unknown", async () => {
            const { manifest, script } = await load_connector();
            const ctx = create_mock_ctx((_endpoint, path) => {
                if (path === "/alpha/billing/credits") {
                    return { credits: { monthlyCredits: 42.5, belowThreshold: false } };
                }
                if (path === "/alpha/billing/subscriptions") {
                    return { data: { planId: "unknown-custom-plan" } };
                }
                return {};
            });

            const result = await run_connector(manifest, script, ctx);
            expect(result.error).toBeNull();
            const monthly = result.observations.find((o) => o.metric_id === "commandcode:monthly");
            expect(monthly).toBeDefined();
            expect(monthly?.used).toBe(42.5);
            expect(monthly?.limit).toBeNull();
            expect(monthly?.display_style).toBe("ratio");
            expect(monthly?.status).toBe("normal");
        });
    });
});
