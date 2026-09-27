import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { create_execution_budget } from "../../../src/main/core/connector/execution-budget";
import { create_connector_context } from "../../../src/main/core/connector/net-client";
import { run_connector } from "../../../src/main/core/connector/runtime";
import { run_connector_isolated } from "../../../src/main/core/connector/isolated-process-runner";
import type { Manifest } from "../../../src/shared/schemas/manifest";
import type { VaultBackend } from "../../../src/main/core/vault/vault-backend";
import type { AppConfigStore } from "../../../src/main/core/config/config-store";
import type { ConnectorDefinition } from "../../../src/main/core/connector/manifest-loader";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function create_mock_vault(params: Record<string, string> = {}): VaultBackend {
    return {
        get: (key: string) => Promise.resolve(params[key] ?? null),
        set: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        has: (key: string) => Promise.resolve(key in params),
        list_keys: () => Promise.resolve(Object.keys(params)),
        replaceAll: () => Promise.resolve(),
    };
}

const test_manifest: Manifest = {
    id: "test_budget_connector",
    provider: "test_budget_provider",
    capabilities: ["session"],
    parameters: [],
    endpoints: { default: "http://127.0.0.1:0" },
    script: "connector.ts",
};

describe("t528: 连接器执行预算、协作取消与有界并发机制", () => {
    describe("AC-001 & AC-005: 预算查询与超时收敛 min(opts, remaining)", () => {
        it("script can query remaining budget and opts.timeout_ms cannot enlarge beyond remaining", async () => {
            const srv = createServer((_req, res) => {
                // Delay 800ms before responding
                setTimeout(() => {
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ ok: true }));
                }, 800);
            });
            await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
            const port = (srv.address() as { port: number }).port;

            try {
                // 1. Clamping enlargement: budget is 200ms, opts.timeout_ms is 999999ms
                // Server delays 800ms, but request aborts in ~200ms (clamped to remaining)
                const budget1 = create_execution_budget(200);
                const ctx1 = create_connector_context(
                    {
                        ...test_manifest,
                        endpoints: { default: `http://127.0.0.1:${String(port)}` },
                    },
                    create_mock_vault(),
                    "inst_budget_1",
                    { budget: budget1 },
                );

                expect(ctx1.deadline_ms).toBe(budget1.deadline_ms);
                expect(ctx1.remaining_ms()).toBeLessThanOrEqual(200);

                const script1 = `
                    // Query remaining budget
                    const rem = ctx.remaining_ms();
                    if (rem <= 0) throw new Error("No budget remaining at start");
                    // Trying to enlarge timeout to 999999ms must be clamped to remaining (<200ms)
                    await ctx.http.get_json("default", "/slow", { timeout_ms: 999999 });
                    return [];
                `;

                const start1 = Date.now();
                const result1 = await run_connector(test_manifest, script1, ctx1, budget1);
                const elapsed1 = Date.now() - start1;

                expect(elapsed1).toBeLessThan(450);
                expect(result1.error_code).toBe("BUDGET_EXHAUSTED");
                expect(result1.error).toContain("budget exhausted");

                // 2. Shrinking: budget is 2000ms, opts.timeout_ms is 60ms
                // Server delays 800ms, but request aborts in ~60ms
                const budget2 = create_execution_budget(2000);
                const ctx2 = create_connector_context(
                    {
                        ...test_manifest,
                        endpoints: { default: `http://127.0.0.1:${String(port)}` },
                    },
                    create_mock_vault(),
                    "inst_budget_1_b",
                    { budget: budget2 },
                );

                const script2 = `
                    try {
                        await ctx.http.get_json("default", "/slow", { timeout_ms: 60 });
                        return [];
                    } catch (err) {
                        return [{
                            provider: "test_budget_provider",
                            account_id: "default",
                            account_label: "Test",
                            metric_id: "test:shrink",
                            raw_label: "shrink",
                            normalized_label: "Shrink",
                            window: "month",
                            used: 1,
                            limit: 1,
                            display_style: "percent",
                            reset_at: null,
                            status: "normal",
                            observed_at: Date.now(),
                            source: "session",
                            stale: false,
                            last_error: err instanceof Error ? err.message : String(err),
                        }];
                    }
                `;

                const start2 = Date.now();
                const result2 = await run_connector(test_manifest, script2, ctx2, budget2);
                const elapsed2 = Date.now() - start2;

                expect(elapsed2).toBeLessThan(350);
                expect(result2.observations).toHaveLength(1);
                expect(result2.observations[0]?.last_error).toMatch(/timed out after 60ms/);
            } finally {
                srv.close();
            }
        });
    });

    describe("AC-002: 软截止协作取消与 BUDGET_EXHAUSTED", () => {
        it("triggers ctx.signal and exits cooperatively with BUDGET_EXHAUSTED", async () => {
            const budget = create_execution_budget(150); // 150ms
            const ctx = create_connector_context(
                test_manifest,
                create_mock_vault(),
                "inst_budget_2",
                {
                    budget,
                },
            );

            const script = `
                await new Promise((resolve) => {
                    ctx.signal.addEventListener("abort", resolve, { once: true });
                });
                throw ctx.signal.reason || new Error("budget exhausted");
            `;

            const start = Date.now();
            const result = await run_connector(test_manifest, script, ctx, budget);
            const elapsed = Date.now() - start;

            expect(elapsed).toBeLessThan(400);
            expect(result.error_code).toBe("BUDGET_EXHAUSTED");
            expect(result.error).toContain("budget exhausted");
        });
    });

    describe("AC-003: 请求与字节计数准确且日志不含正文", () => {
        it("counts initiated requests and UTF-8 decoded bytes accurately", async () => {
            const srv = createServer((req, res) => {
                if (req.url === "/data1") {
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ greeting: "hello world" })); // 25 bytes
                } else if (req.url === "/data2") {
                    res.writeHead(200, { "Content-Type": "text/plain;charset=UTF-8" });
                    res.end("sample raw text response"); // 24 bytes
                } else {
                    res.writeHead(404);
                    res.end("not found");
                }
            });
            await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
            const port = (srv.address() as { port: number }).port;

            try {
                const budget = create_execution_budget(5000);
                const ctx = create_connector_context(
                    {
                        ...test_manifest,
                        endpoints: { default: `http://127.0.0.1:${String(port)}` },
                    },
                    create_mock_vault(),
                    "inst_budget_3",
                    { budget },
                );

                const script = `
                    await ctx.http.get_json("default", "/data1");
                    await ctx.http.get_raw("default", "/data2");
                    try {
                        await ctx.http.get_json("default", "/not-exist");
                    } catch {}
                    return [];
                `;

                const result = await run_connector(test_manifest, script, ctx, budget);
                expect(result.error).toBeNull();
                // 3 requests were initiated
                expect(result.metrics.requests).toBe(3);
                // bytes received: data1 json text + data2 raw text + error body of 404
                expect(result.metrics.bytes).toBeGreaterThanOrEqual(25 + 24 + 9);
            } finally {
                srv.close();
            }
        });
    });

    describe("AC-004: 宿主强制限流与增量并发原语 ctx.pool", () => {
        it("limits bare Promise.all in-flight requests and allows ctx.pool incremental stop", async () => {
            let in_flight = 0;
            let max_in_flight = 0;

            const srv = createServer((_req, res) => {
                in_flight++;
                max_in_flight = Math.max(max_in_flight, in_flight);
                setTimeout(() => {
                    in_flight--;
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ ok: true }));
                }, 50);
            });
            await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
            const port = (srv.address() as { port: number }).port;

            try {
                const budget = create_execution_budget(5000);
                const ctx = create_connector_context(
                    {
                        ...test_manifest,
                        endpoints: { default: `http://127.0.0.1:${String(port)}` },
                    },
                    create_mock_vault(),
                    "inst_budget_4",
                    { budget, max_concurrency: 4 },
                );

                const script = `
                    // 1. Bare Promise.all with 12 requests: must be capped at max_concurrency (4)
                    const urls = Array.from({ length: 12 }, (_, i) => "/req" + i);
                    await Promise.all(urls.map(u => ctx.http.get_json("default", u)));

                    // 2. Incremental pool: stop early when target item found
                    let stopped_index = -1;
                    for await (const item of ctx.pool.map([1, 2, 3, 4, 5, 6, 7, 8], async (n) => {
                        const data = await ctx.http.get_json("default", "/pool" + n);
                        return { n, data };
                    }, { concurrency: 2 })) {
                        if (item.n === 3) {
                            stopped_index = 3;
                            break; // Generator break cleanly stops the pool
                        }
                    }

                    // 3. Subsequent request can proceed normally
                    const post_result = await ctx.http.get_json("default", "/after-pool");
                    return [{
                        provider: "test_budget_provider",
                        account_id: "default",
                        account_label: "Test",
                        metric_id: "test:after",
                        raw_label: "after",
                        normalized_label: "After",
                        window: "month",
                        used: stopped_index,
                        limit: 100,
                        display_style: "percent",
                        reset_at: null,
                        status: "normal",
                        observed_at: Date.now(),
                        source: "session",
                        stale: false,
                        last_error: null,
                    }];
                `;

                const result = await run_connector(test_manifest, script, ctx, budget);
                expect(result.error).toBeNull();
                expect(max_in_flight).toBeLessThanOrEqual(4);
                expect(result.observations).toHaveLength(1);
                expect(result.observations[0]?.used).toBe(3);
            } finally {
                srv.close();
            }
        });
    });

    describe("AC-006: 预算跨 retry 共享，连续消耗不重置", () => {
        it("shared budget drains across retries and stops when exhausted", async () => {
            const { createRefreshService } =
                await import("../../../src/main/core/scheduler/refresh-service");
            const { create_observation_store } =
                await import("../../../src/main/core/observation/observation-store");
            const { createRuntimeStore } =
                await import("../../../src/main/core/scheduler/runtime-store");
            const { tmpdir } = await import("node:os");
            const { mkdtemp, rm } = await import("node:fs/promises");

            const dir = await mkdtemp(join(tmpdir(), "t528-retry-"));
            try {
                const obs_store = create_observation_store(join(dir, "obs.db"));
                const runtime_store = createRuntimeStore();

                const remaining_samples: number[] = [];
                let attempts_called = 0;

                const mock_config_store = {
                    load: () =>
                        Promise.resolve({
                            schemaVersion: 2,
                            plugins: [
                                {
                                    instanceId: "inst_retry_1",
                                    manifestId: "test_retry",
                                    name: "Retry Test",
                                    enabled: true,
                                    intervalMinutes: 1,
                                },
                            ],
                        }),
                    save: () => Promise.resolve(),
                    saveDirect: () => Promise.resolve(),
                } as unknown as AppConfigStore;

                const mock_definitions = [
                    {
                        manifest: {
                            id: "test_retry",
                            provider: "cpa",
                            capabilities: ["poll"],
                            parameters: [],
                        },
                        dir: "/tmp",
                    },
                ] as unknown as ConnectorDefinition[];

                const service = createRefreshService({
                    configStore: mock_config_store,
                    definitions: mock_definitions,
                    vault: create_mock_vault(),
                    observationStore: obs_store,
                    runtimeStore: runtime_store,
                    execute_connector: async (...args) => {
                        const budget = args[6];
                        attempts_called++;
                        if (budget) {
                            remaining_samples.push(budget.remaining_ms());
                        }
                        // Simulate delay and retryable failure
                        await new Promise((r) => setTimeout(r, 50));
                        throw new Error("Temporary network glitch");
                    },
                });

                await service.refresh("inst_retry_1");

                // Budget was shared across attempts: remaining budget strictly decreased
                expect(attempts_called).toBeGreaterThanOrEqual(2);
                expect(remaining_samples.length).toBe(attempts_called);
                for (let i = 1; i < remaining_samples.length; i++) {
                    const prev = remaining_samples[i - 1];
                    expect(prev).toBeDefined();
                    if (prev !== undefined) {
                        expect(remaining_samples[i]).toBeLessThan(prev);
                    }
                }
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        });
    });

    describe("AC-007: 软截止后仍未退出时硬上限终止为 TERMINATED", () => {
        it("terminates uncooperative worker with TERMINATED in isolated process", async () => {
            // Budget 1200ms gives ample margin for process spawn under high test concurrency,
            // script enters sync loop, soft deadline expires, and watchdog kills at 1200ms + 1500ms = ~2700ms
            const budget = create_execution_budget(1200);
            const script = `
                // Completely uncooperative infinite sync loop
                while (true) {}
            `;

            const start = Date.now();
            const result = await run_connector_isolated({
                manifest: test_manifest,
                script_code: script,
                budget,
            });
            const elapsed = Date.now() - start;

            expect(result.error_code).toBe("TERMINATED");
            expect(result.error).toContain("terminated");
            expect(elapsed).toBeGreaterThanOrEqual(2300);
            expect(elapsed).toBeLessThan(5000);
        });
    });

    describe("AC-008: 过期执行 generation 不覆盖较新执行", () => {
        it("outdated generation execution does not overwrite runtime state or observations", async () => {
            const { createRefreshService } =
                await import("../../../src/main/core/scheduler/refresh-service");
            const { create_observation_store } =
                await import("../../../src/main/core/observation/observation-store");
            const { createRuntimeStore } =
                await import("../../../src/main/core/scheduler/runtime-store");
            const { tmpdir } = await import("node:os");
            const { mkdtemp, rm } = await import("node:fs/promises");

            const dir = await mkdtemp(join(tmpdir(), "t528-gen-"));
            try {
                const obs_store = create_observation_store(join(dir, "obs.db"));
                const runtime_store = createRuntimeStore();

                let exec_count = 0;
                let resolve_slow: (() => void) | null = null;
                const slow_promise = new Promise<void>((r) => {
                    resolve_slow = r;
                });

                const race_config_store = {
                    load: () =>
                        Promise.resolve({
                            schemaVersion: 2,
                            plugins: [
                                {
                                    instanceId: "inst_race_1",
                                    manifestId: "test_race",
                                    name: "Race Test",
                                    enabled: true,
                                    intervalMinutes: 1,
                                },
                            ],
                        }),
                    save: () => Promise.resolve(),
                    saveDirect: () => Promise.resolve(),
                } as unknown as AppConfigStore;

                const race_definitions = [
                    {
                        manifest: {
                            id: "test_race",
                            provider: "cpa",
                            capabilities: ["poll"],
                            parameters: [],
                        },
                        dir: "/tmp",
                    },
                ] as unknown as ConnectorDefinition[];

                const service = createRefreshService({
                    configStore: race_config_store,
                    definitions: race_definitions,
                    vault: create_mock_vault(),
                    observationStore: obs_store,
                    runtimeStore: runtime_store,
                    execute_connector: async () => {
                        exec_count++;
                        if (exec_count === 1) {
                            // First run (slow): wait until run 2 finishes
                            await slow_promise;
                            return {
                                observations: [
                                    {
                                        provider: "cpa",
                                        source_instance_id: "inst_race_1",
                                        account_id: "race",
                                        account_label: "Race",
                                        metric_id: "cpa:race:old",
                                        raw_label: "old",
                                        normalized_label: "Old",
                                        window: "month",
                                        used: 10,
                                        limit: 100,
                                        display_style: "percent",
                                        reset_at: null,
                                        status: "normal",
                                        observed_at: 1000,
                                        source: "poll",
                                        stale: false,
                                        last_error: null,
                                    },
                                ],
                                failed_accounts: [],
                                metrics: { requests: 1, bytes: 10 },
                            };
                        } else {
                            // Second run (fast): completes first
                            return {
                                observations: [
                                    {
                                        provider: "cpa",
                                        source_instance_id: "inst_race_1",
                                        account_id: "race",
                                        account_label: "Race",
                                        metric_id: "cpa:race:new",
                                        raw_label: "new",
                                        normalized_label: "New",
                                        window: "month",
                                        used: 99,
                                        limit: 100,
                                        display_style: "percent",
                                        reset_at: null,
                                        status: "normal",
                                        observed_at: 2000,
                                        source: "poll",
                                        stale: false,
                                        last_error: null,
                                    },
                                ],
                                failed_accounts: [],
                                metrics: { requests: 1, bytes: 10 },
                            };
                        }
                    },
                });

                // Start execution 1 (slow)
                const p1 = service.refresh("inst_race_1");
                // Start execution 2 with force (fast)
                const p2 = service.refresh("inst_race_1", { force: true });
                await p2;

                // Verify run 2 state is active
                const snapshot_after_2 = runtime_store.getSnapshot("inst_race_1");
                expect(snapshot_after_2.status).toBe("ready");
                const item2 = (snapshot_after_2 as { items?: { id: string }[] }).items?.[0];
                expect(item2?.id).toBe("inst_race_1:race:cpa:race:new");

                // Now let run 1 finish
                if (typeof resolve_slow === "function") {
                    (resolve_slow as () => void)();
                }
                await p1;

                // Run 1 MUST NOT have overwritten run 2!
                const final_snapshot = runtime_store.getSnapshot("inst_race_1");
                expect(final_snapshot.status).toBe("ready");
                const final_item = (final_snapshot as { items?: { id: string }[] }).items?.[0];
                expect(final_item?.id).toBe("inst_race_1:race:cpa:race:new");

                const stored = obs_store.list_by_source_instance_id("inst_race_1");
                expect(stored.some((o) => o.metric_id === "cpa:race:new")).toBe(true);
                expect(stored.some((o) => o.metric_id === "cpa:race:old")).toBe(false);
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        });
    });

    describe("AC-009: 静态断言 DEFAULT_TIMEOUT_MS 不再出现在执行路径", () => {
        it("ensures DEFAULT_TIMEOUT_MS does not exist in src/", () => {
            const constants_file = readFileSync(
                join(process.cwd(), "src/shared/constants.ts"),
                "utf8",
            );
            expect(constants_file).not.toContain("DEFAULT_TIMEOUT_MS");

            const runtime_file = readFileSync(
                join(process.cwd(), "src/main/core/connector/runtime.ts"),
                "utf8",
            );
            expect(runtime_file).not.toContain("DEFAULT_TIMEOUT_MS");

            const refresh_file = readFileSync(
                join(process.cwd(), "src/main/core/scheduler/refresh-service.ts"),
                "utf8",
            );
            expect(refresh_file).not.toContain("DEFAULT_TIMEOUT_MS");
        });
    });
});
