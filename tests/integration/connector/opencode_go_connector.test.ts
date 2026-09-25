import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi, afterEach } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import {
    status_for_ratio,
    status_for_pct,
    status_for_balance,
} from "../../../src/main/core/connector/net-client";
import type { Manifest } from "../../../src/shared/schemas/manifest";

const manifest: Manifest = {
    id: "opencode_go",
    provider: "opencode_go",
    capabilities: ["session"],
    parameters: [{ name: "SESSION_COOKIE", type: "secret", required: true, exposeToScript: true }],
    endpoints: { default: "https://opencode.ai" },
    script: "connector.ts",
};

function make_ctx(
    get_json: ConnectorContext["http"]["get_json"],
    warn_spy = vi.fn(),
    cookie = "__Host-console_session=valid-session",
): ConnectorContext & { warn_spy: typeof warn_spy } {
    return {
        log: { debug: vi.fn(), info: vi.fn(), warn: warn_spy, error: vi.fn() },
        http: {
            get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            get_json,
            post_json: () => Promise.resolve({}),
        },
        files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
        params: { SESSION_COOKIE: cookie },
        // A89 / AC-001: 直达生产环境真实的阈值计算实现，杜绝测试私自 mock 阈值掩盖漂移
        status: {
            for_ratio: status_for_ratio,
            for_pct: status_for_pct,
            for_balance: status_for_balance,
        },
        report_failed_account: () => undefined,
        warn_spy,
    };
}

describe("opencode_go connector (t506 console REST API)", () => {
    afterEach(() => {
        delete (Object.prototype as unknown as { __opencode_org_cache?: unknown })
            .__opencode_org_cache;
    });

    it("fetches orgs and maps 24h, 7d, 30d usage summaries and billing status to observations", async () => {
        const script = await readFile(join("connectors", "opencode_go", "connector.ts"), "utf8");
        const get_json = vi
            .fn<ConnectorContext["http"]["get_json"]>()
            .mockImplementation((_endpoint: string, path: string) => {
                if (path === "/console/api/orgs") {
                    return Promise.resolve([
                        { id: "wrk_01KVAJY3W1421VAB7X1F6KR1JA", name: "Default" },
                    ]);
                }
                if (path === "/console/api/go/status") {
                    return Promise.resolve({
                        subscriberUserId: "acc_01KVAJY3F9FA02SWBZ2X6V8WS1",
                        access: {
                            endsAt: "2026-10-17T18:58:27.000Z",
                            meters: {
                                fiveHour: {
                                    startsAt: "2026-09-19T19:09:02.806Z",
                                    resetsAt: "2026-09-20T00:09:02.806Z",
                                    limitMicroCents: "1200000000",
                                    usedMicroCents: "8963440",
                                },
                                week: {
                                    startsAt: "2026-09-14T00:00:00.000Z",
                                    resetsAt: "2026-09-21T00:00:00.000Z",
                                    limitMicroCents: "3000000000",
                                    usedMicroCents: "468519427",
                                },
                                month: {
                                    limitMicroCents: "6000000000",
                                    usedMicroCents: "468519427",
                                },
                            },
                        },
                    });
                }
                if (path === "/console/api/billing/status") {
                    return Promise.resolve({
                        billingMode: "prepaid",
                        mode: "pay-as-you-go",
                        balanceMicroCents: "500000000",
                        availableMicroCents: "500000000",
                    });
                }
                return Promise.reject(new Error(`Unexpected path: ${path}`));
            });

        const result = await run_connector(manifest, script, make_ctx(get_json));

        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(3);

        const rolling = result.observations.find((o) => o.metric_id === "opencode_go:rolling");
        expect(rolling).toMatchObject({
            provider: "opencode_go",
            account_id: "wrk_01KVAJY3W1421VAB7X1F6KR1JA",
            account_label: "Default",
            raw_label: "rolling",
            normalized_label: "5h",
            used: 1,
            limit: 100,
            display_style: "percent",
            status: "normal",
        });

        const weekly = result.observations.find((o) => o.metric_id === "opencode_go:weekly");
        expect(weekly).toMatchObject({
            raw_label: "weekly",
            normalized_label: "一周",
            used: 16,
            limit: 100,
            display_style: "percent",
        });

        const monthly = result.observations.find((o) => o.metric_id === "opencode_go:monthly");
        expect(monthly).toMatchObject({
            raw_label: "monthly",
            normalized_label: "一月",
            used: 8,
            limit: 100,
            display_style: "percent",
        });
    });

    it("maps monthly resetsAt to observation resets_at when present (A57 / AC-003)", async () => {
        const script = await readFile(join("connectors", "opencode_go", "connector.ts"), "utf8");
        const expected_resets_at = Date.parse("2026-10-01T00:00:00.000Z");
        const get_json = vi
            .fn<ConnectorContext["http"]["get_json"]>()
            .mockImplementation((_endpoint: string, path: string) => {
                if (path === "/console/api/orgs") {
                    return Promise.resolve([{ id: "org_reset", name: "Reset Org" }]);
                }
                if (path === "/console/api/go/status") {
                    return Promise.resolve({
                        access: {
                            meters: {
                                month: {
                                    startsAt: "2026-09-01T00:00:00.000Z",
                                    resetsAt: "2026-10-01T00:00:00.000Z",
                                    limitMicroCents: "6000000000",
                                    usedMicroCents: "468519427",
                                },
                            },
                        },
                    });
                }
                return Promise.resolve({});
            });

        const result = await run_connector(manifest, script, make_ctx(get_json));
        expect(result.error).toBeNull();
        const monthly = result.observations.find((o) => o.metric_id === "opencode_go:monthly");
        expect(monthly).toBeDefined();
        expect(monthly?.reset_at).toBe(expected_resets_at);
    });

    it("throws session expired error when orgs request fails with 401 Unauthorized", async () => {
        const script = await readFile(join("connectors", "opencode_go", "connector.ts"), "utf8");
        const get_json = vi
            .fn<ConnectorContext["http"]["get_json"]>()
            .mockRejectedValue(new Error("HTTP 401: Unauthorized (45 bytes)"));

        const result = await run_connector(manifest, script, make_ctx(get_json));
        expect(result.error).toMatch(/OpenCode 会话已失效，请重新登录/);
    });

    it("throws error when no organizations returned", async () => {
        const script = await readFile(join("connectors", "opencode_go", "connector.ts"), "utf8");
        const get_json = vi.fn<ConnectorContext["http"]["get_json"]>().mockResolvedValue([]);

        const result = await run_connector(manifest, script, make_ctx(get_json));
        expect(result.error).toMatch(/未找到可用组织或工作区/);
    });

    it("iterates all organizations and isolates account_id per org (A148 / AC-004)", async () => {
        const script = await readFile(join("connectors", "opencode_go", "connector.ts"), "utf8");
        const get_json = vi
            .fn<ConnectorContext["http"]["get_json"]>()
            .mockImplementation((_endpoint: string, path: string, opts) => {
                if (path === "/console/api/orgs") {
                    return Promise.resolve([
                        { id: "org_1", name: "Org One" },
                        { id: "org_2", name: "Org Two" },
                    ]);
                }
                const org_id = opts?.headers?.["x-org-id"];
                if (path === "/console/api/go/status") {
                    return Promise.resolve({
                        access: {
                            meters: {
                                fiveHour: {
                                    limitMicroCents: "1000",
                                    usedMicroCents: org_id === "org_1" ? "200" : "500",
                                },
                            },
                        },
                    });
                }
                return Promise.resolve({});
            });

        const result = await run_connector(manifest, script, make_ctx(get_json));
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(2);

        const obs_org1 = result.observations.find((o) => o.account_id === "org_1");
        const obs_org2 = result.observations.find((o) => o.account_id === "org_2");
        expect(obs_org1).toBeDefined();
        expect(obs_org1?.account_label).toBe("Org One");
        expect(obs_org1?.used).toBe(20);

        expect(obs_org2).toBeDefined();
        expect(obs_org2?.account_label).toBe("Org Two");
        expect(obs_org2?.used).toBe(50);
    });

    it("throws session expired error when status returns 401 during collect (A8 / AC-001)", async () => {
        const script = await readFile(join("connectors", "opencode_go", "connector.ts"), "utf8");
        const get_json = vi
            .fn<ConnectorContext["http"]["get_json"]>()
            .mockImplementation((_endpoint: string, path: string) => {
                if (path === "/console/api/orgs") {
                    return Promise.resolve([{ id: "org_1", name: "Default" }]);
                }
                return Promise.reject(new Error("401 Unauthorized"));
            });

        const result = await run_connector(manifest, script, make_ctx(get_json));
        expect(result.error).toMatch(/OpenCode 会话已失效，请重新登录/);
    });

    it("skips metric when limit is <= 0 instead of faking 0% (A56 / AC-002)", async () => {
        const script = await readFile(join("connectors", "opencode_go", "connector.ts"), "utf8");
        const get_json = vi
            .fn<ConnectorContext["http"]["get_json"]>()
            .mockImplementation((_endpoint: string, path: string) => {
                if (path === "/console/api/orgs") {
                    return Promise.resolve([{ id: "org_1", name: "Default" }]);
                }
                if (path === "/console/api/go/status") {
                    return Promise.resolve({
                        access: {
                            meters: {
                                fiveHour: {
                                    limitMicroCents: "0", // 非法/无效 limit
                                    usedMicroCents: "100",
                                },
                                week: {
                                    limitMicroCents: "1000",
                                    usedMicroCents: "100",
                                },
                            },
                        },
                    });
                }
                return Promise.resolve({});
            });

        const ctx = make_ctx(get_json);
        const result = await run_connector(manifest, script, ctx);
        expect(result.error).toBeNull();
        // fiveHour 应该被跳过，只有 week 指标
        expect(result.observations).toHaveLength(1);
        expect(result.observations[0]?.raw_label).toBe("weekly");
        // A56 / f003: 断言输出了 warn 日志
        expect(ctx.warn_spy).toHaveBeenCalledWith(
            expect.stringContaining("5h metric invalid or missing limit"),
        );
    });

    it("memoizes org query across poll cycles with 1h TTL (A115 / AC-004)", async () => {
        const script = await readFile(join("connectors", "opencode_go", "connector.ts"), "utf8");

        let orgs_request_count = 0;
        const get_json = vi
            .fn<ConnectorContext["http"]["get_json"]>()
            .mockImplementation((_endpoint: string, path: string) => {
                if (path === "/console/api/orgs") {
                    orgs_request_count++;
                    return Promise.resolve([{ id: "org_memo", name: "Memo Org" }]);
                }
                if (path === "/console/api/go/status") {
                    return Promise.resolve({
                        access: {
                            meters: {
                                fiveHour: {
                                    limitMicroCents: "1000",
                                    usedMicroCents: "100",
                                },
                            },
                        },
                    });
                }
                return Promise.resolve({});
            });

        const ctx1 = make_ctx(get_json, undefined, "cookie_user_a");
        const result1 = await run_connector(manifest, script, ctx1);
        expect(result1.error).toBeNull();
        expect(orgs_request_count).toBe(1);

        // 第二次轮询周期（新的 ctx，新的 vm.Context，相同的 cookie）：命中缓存，不发起新请求
        const ctx2 = make_ctx(get_json, undefined, "cookie_user_a");
        const result2 = await run_connector(manifest, script, ctx2);
        expect(result2.error).toBeNull();
        expect(orgs_request_count).toBe(1);

        // 第三次轮询周期（不同 cookie）：缓存不命中，发起新请求
        const ctx3 = make_ctx(get_json, undefined, "cookie_user_b");
        const result3 = await run_connector(manifest, script, ctx3);
        expect(result3.error).toBeNull();
        expect(orgs_request_count).toBe(2);
    });

    it("A89 / AC-001: verifies real production thresholds at 75% and 90% boundaries", async () => {
        const script = await readFile(join("connectors", "opencode_go", "connector.ts"), "utf8");

        const test_usage = async (used: string, limit: string) => {
            const get_json = vi
                .fn<ConnectorContext["http"]["get_json"]>()
                .mockImplementation((_endpoint, path) => {
                    if (path === "/console/api/orgs")
                        return Promise.resolve([{ id: "org_bound", name: "Org" }]);
                    if (path === "/console/api/go/status") {
                        return Promise.resolve({
                            access: {
                                meters: {
                                    fiveHour: { limitMicroCents: limit, usedMicroCents: used },
                                },
                            },
                        });
                    }
                    return Promise.resolve({});
                });
            const ctx = make_ctx(get_json);
            const res = await run_connector(manifest, script, ctx);
            expect(res.error).toBeNull();
            return res.observations.find((o) => o.metric_id === "opencode_go:rolling")?.status;
        };

        // 74% -> normal
        expect(await test_usage("740", "1000")).toBe("normal");
        // 75% -> warning
        expect(await test_usage("750", "1000")).toBe("warning");
        // 89% -> warning
        expect(await test_usage("890", "1000")).toBe("warning");
        // 90% -> critical
        expect(await test_usage("900", "1000")).toBe("critical");
    });
});
