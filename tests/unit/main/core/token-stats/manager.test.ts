/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

/** flush 一个宏任务（setImmediate）。 */
function flush_one_macrotask(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}

/** flush 直到所有已排队的 setImmediate 都执行（循环 flush 上限 50 次防死循环）。 */
async function flush_macrotasks(): Promise<void> {
    for (let i = 0; i < 50; i++) {
        await flush_one_macrotask();
    }
}

// --- Mock electron (utilityProcess) ---

class MockUtilityProcess extends EventEmitter {
    postMessage = vi.fn();
    kill = vi.fn();
    stdout = new EventEmitter();
    stderr = new EventEmitter();
}

let last_child: MockUtilityProcess | null = null;
const mock_fork = vi.fn<(path: string, args?: string[], options?: unknown) => MockUtilityProcess>(
    () => {
        last_child = new MockUtilityProcess();
        return last_child;
    },
);

vi.mock("electron", () => ({
    app: { isPackaged: false },
    utilityProcess: {
        fork: (path: string, args?: string[], options?: unknown) => mock_fork(path, args, options),
    },
}));

import { create_token_stats_manager } from "../../../../../src/main/core/token-stats/manager";
import type { TokenStatsStore } from "../../../../../src/main/core/token-stats/token-stats-store";
import type { TokenStatsConfig } from "../../../../../src/shared/types/token-stats";

const base_config: TokenStatsConfig = {
    win_home: "C:\\Users\\Test",
    wsl_enabled: false,
    wsl_distro: "Ubuntu-22.04",
    wsl_user: "testuser",
    poll_interval_ms: 600000,
    state_path: "",
};

function create_mock_store() {
    return {
        upsert_sessions: vi.fn(),
        upsert_records: vi.fn(),
        query_buckets: vi.fn(() => []),
        query_sessions: vi.fn(() => []),
        query_session_stats: vi.fn(() => ({ sessions: 0, agents: 0, tokens: 0 })),
        query_records: vi.fn(() => []),
        query_heatmap: vi.fn(() => []),
        query_hour_buckets: vi.fn(() => []),
        query_range_rollup: vi.fn(() => []),
        query_dashboard: vi.fn(),
        query_dashboard_sessions: vi.fn(),
        get_data_version: vi.fn(() => 0),
        is_hour_rollup_ready: vi.fn(() => false),
        backfill_hour_rollup: vi.fn(),
        last_updated: vi.fn(() => null),
        set_sources_status: vi.fn(),
        sources_status: vi.fn(() => []),
        close: vi.fn(),
    } satisfies TokenStatsStore;
}

describe("token-stats manager", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        last_child = null;
    });

    it("start forks the collector and posts config", () => {
        const store = create_mock_store();
        const manager = create_token_stats_manager({ store });

        manager.start(base_config);

        expect(mock_fork).toHaveBeenCalledTimes(1);
        expect(mock_fork.mock.calls[0]![0]).toContain("collector.js");
        expect(last_child!.postMessage).toHaveBeenCalledWith({
            type: "config",
            config: base_config,
        });
        expect(manager.is_running()).toBe(true);
        manager.stop();
    });

    it("stores session deltas + daily rows on update message and fires on_update", async () => {
        const store = create_mock_store();
        const on_update = vi.fn();
        const manager = create_token_stats_manager({ store, on_update });

        manager.start(base_config);
        last_child!.emit("message", {
            type: "token_stats_update",
            sessions: [{ id: "s1" }],
            daily: [{ id: "s1", date: "2026-07-17" }],
        });

        // 分批让路：upsert 经 setImmediate 异步执行，等待宏任务 flush。
        await flush_macrotasks();
        expect(store.upsert_sessions).toHaveBeenCalledWith(
            [{ id: "s1" }],
            [{ id: "s1", date: "2026-07-17" }],
            true,
        );
        expect(on_update).toHaveBeenCalledTimes(1);
        manager.stop();
    });

    it("大批 update 分批让路：每批间 setImmediate 让出事件循环（t256）", async () => {
        const store = create_mock_store();
        const on_update = vi.fn();
        const manager = create_token_stats_manager({ store, on_update });

        manager.start(base_config);
        const sessions = Array.from({ length: 5000 }, (_, i) => ({ id: `s${String(i)}` }));
        last_child!.emit("message", {
            type: "token_stats_update",
            sessions,
            daily: [],
            records: [],
        });

        // flush 一个宏任务：第一批同步执行，随后 setImmediate 排第二批；flush 后处理 2 批（4000），证明分批让出。
        await flush_one_macrotask();
        expect(store.upsert_sessions).toHaveBeenCalledTimes(2);
        expect(store.upsert_sessions).toHaveBeenNthCalledWith(
            1,
            sessions.slice(0, 2000),
            [],
            false,
        );
        expect(on_update).not.toHaveBeenCalled();

        // flush 剩余批次：第 3 批（1000）处理完并触发 on_update。
        await flush_macrotasks();
        expect(store.upsert_sessions).toHaveBeenCalledTimes(3);
        expect(on_update).toHaveBeenCalledTimes(1);
        manager.stop();
    });

    it("records 多于 sessions 时不丢数据，循环边界取最大长度（t256 f001）", async () => {
        const store = create_mock_store();
        const on_update = vi.fn();
        const manager = create_token_stats_manager({ store, on_update });

        manager.start(base_config);
        const sessions = [{ id: "s1" }];
        const records = Array.from({ length: 5000 }, (_, i) => ({ id: `r${String(i)}` }));
        last_child!.emit("message", {
            type: "token_stats_update",
            sessions,
            daily: [],
            records,
        });

        await flush_macrotasks();
        // records 5000 → 3 批；upsert_records 每次收到 ≤2000。
        expect(store.upsert_records).toHaveBeenCalledTimes(3);
        expect(store.upsert_records).toHaveBeenNthCalledWith(1, records.slice(0, 2000));
        expect(store.upsert_records).toHaveBeenNthCalledWith(3, records.slice(4000, 5000));
        expect(store.upsert_sessions).toHaveBeenCalledTimes(3);
        expect(on_update).toHaveBeenCalledTimes(1);
        manager.stop();
    });

    it("forwards sources_status from update messages to the store (t309)", () => {
        const store = create_mock_store();
        const manager = create_token_stats_manager({ store });

        manager.start(base_config);
        last_child!.emit("message", {
            type: "token_stats_update",
            sessions: [],
            daily: [],
            sources_status: [
                {
                    source: "grok",
                    env: "wsl",
                    status: "unavailable",
                    lastError: "sessions dir missing",
                },
            ],
        });

        expect(store.set_sources_status).toHaveBeenCalledWith([
            {
                source: "grok",
                env: "wsl",
                status: "unavailable",
                lastError: "sessions dir missing",
            },
        ]);
        manager.stop();
    });

    it("defaults sources_status to [] when the update omits it (t309)", () => {
        const store = create_mock_store();
        const manager = create_token_stats_manager({ store });

        manager.start(base_config);
        last_child!.emit("message", {
            type: "token_stats_update",
            sessions: [],
            daily: [],
        });

        expect(store.set_sources_status).toHaveBeenCalledWith([]);
        manager.stop();
    });

    it("ignores non-update messages", () => {
        const store = create_mock_store();
        const manager = create_token_stats_manager({ store });

        manager.start(base_config);
        last_child!.emit("message", { type: "something_else", sessions: [{ id: "s1" }] });

        expect(store.upsert_sessions).not.toHaveBeenCalled();
        manager.stop();
    });

    it("auto-restarts 30s after unexpected exit", () => {
        vi.useFakeTimers();
        try {
            const store = create_mock_store();
            const manager = create_token_stats_manager({ store });

            manager.start(base_config);
            expect(mock_fork).toHaveBeenCalledTimes(1);

            last_child!.emit("exit", 1);
            expect(manager.is_running()).toBe(false);

            vi.advanceTimersByTime(30_000);
            expect(mock_fork).toHaveBeenCalledTimes(2);
            expect(manager.is_running()).toBe(true);
            manager.stop();
        } finally {
            vi.useRealTimers();
        }
    });

    it("does not restart after stop()", () => {
        vi.useFakeTimers();
        try {
            const store = create_mock_store();
            const manager = create_token_stats_manager({ store });

            manager.start(base_config);
            manager.stop();

            vi.advanceTimersByTime(60_000);
            expect(mock_fork).toHaveBeenCalledTimes(1);
            expect(manager.is_running()).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });

    it("stop() clears a pending restart timer scheduled by exit (A13)", () => {
        vi.useFakeTimers();
        try {
            const store = create_mock_store();
            const manager = create_token_stats_manager({ store });

            manager.start(base_config);
            last_child!.emit("exit", 1); // schedules a restart in 30s
            manager.stop(); // must clear that timer, not just null the config

            vi.advanceTimersByTime(60_000);
            expect(mock_fork).toHaveBeenCalledTimes(1);
            expect(manager.is_running()).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });

    it("stops auto-restart after repeated rapid crashes (A14)", () => {
        vi.useFakeTimers();
        try {
            const store = create_mock_store();
            const manager = create_token_stats_manager({ store });

            manager.start(base_config); // fork #1
            // 5 rapid exit+restart cycles — each restart happens 30s later,
            // well within the 5-minute rapid-exit threshold.
            for (let i = 0; i < 5; i++) {
                last_child!.emit("exit", 1);
                vi.advanceTimersByTime(30_000);
            }
            // start + 4 successful restarts = 5 forks; the 5th rapid exit trips
            // the breaker and no further restart is scheduled.
            expect(mock_fork).toHaveBeenCalledTimes(5);

            vi.advanceTimersByTime(120_000);
            expect(mock_fork).toHaveBeenCalledTimes(5);
            expect(manager.is_running()).toBe(false);
            // t396 AC-002: 熔断跳闸与显式停止可区分。
            expect(manager.is_tripped()).toBe(true);
            // stop 复位熔断态 → 区别于熔断跳闸。
            manager.stop();
            expect(manager.is_tripped()).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });

    it("update_config posts new config to the running child", () => {
        const store = create_mock_store();
        const manager = create_token_stats_manager({ store });

        manager.start(base_config);
        const new_config = { ...base_config, poll_interval_ms: 300_000 };
        manager.update_config(new_config);

        expect(last_child!.postMessage).toHaveBeenLastCalledWith({
            type: "config",
            config: new_config,
        });
        manager.stop();
    });

    it("update_config skips postMessage when config is unchanged (D debounce)", () => {
        const store = create_mock_store();
        const manager = create_token_stats_manager({ store });

        manager.start(base_config);
        // start() posts config once (1 call). An identical update_config must
        // NOT post again - frequent unrelated config saves (card reorder, etc.)
        // were triggering full collector rescans ~4720x/day.
        const calls_before = last_child!.postMessage.mock.calls.length;
        manager.update_config(base_config);
        expect(last_child!.postMessage.mock.calls.length).toBe(calls_before);
        manager.stop();
    });

    it("update_config posts when only a nested tokenStats field changes", () => {
        const store = create_mock_store();
        const manager = create_token_stats_manager({ store });

        manager.start(base_config);
        manager.update_config({ ...base_config, wsl_distro: "Debian" });

        expect(last_child!.postMessage).toHaveBeenLastCalledWith({
            type: "config",
            config: { ...base_config, wsl_distro: "Debian" },
        });
        manager.stop();
    });

    it("stop kills the child", () => {
        const store = create_mock_store();
        const manager = create_token_stats_manager({ store });

        manager.start(base_config);
        const child_ref = last_child!;
        manager.stop();

        expect(child_ref.kill).toHaveBeenCalledTimes(1);
        expect(manager.is_running()).toBe(false);
    });

    it("routes collector_log messages through the main logger (D7)", async () => {
        const { addTransport } = await import("node:events").then(
            () => import("../../../../../src/shared/lib/logger"),
        );
        const logged: { module: string; message: string; level: string }[] = [];
        const remove = addTransport({
            write(level, module, message) {
                logged.push({ module, message, level });
            },
        });
        try {
            const store = create_mock_store();
            const manager = create_token_stats_manager({ store });
            manager.start(base_config);
            last_child!.emit("message", {
                type: "collector_log",
                level: "warn",
                module: "collector",
                message: "sessions exceed limit",
            });
            const matched = logged.find(
                (e) => e.module === "collector" && e.message === "sessions exceed limit",
            );
            expect(matched).toBeDefined();
            expect(matched?.level).toBe("warn");
            manager.stop();
        } finally {
            remove();
        }
    });

    it("restarts the collector on config update after circuit breaker trips (t347 AC-003)", () => {
        vi.useFakeTimers();
        try {
            const store = create_mock_store();
            const manager = create_token_stats_manager({ store });
            manager.start(base_config);

            // 5 次快速崩溃 + 30s 自动重启循环：每次崩溃计数+1，最终触发熔断。
            for (let i = 0; i < 5; i++) {
                last_child!.emit("exit", 1);
                vi.advanceTimersByTime(30_000);
            }
            expect(manager.is_running()).toBe(false);
            expect(mock_fork).toHaveBeenCalledTimes(5);
            // t396 AC-002: 熔断跳闸态可观察。
            expect(manager.is_tripped()).toBe(true);

            // 熔断后配置更新 → 恢复路径：重新 spawn，熔断态复位。
            manager.update_config({ ...base_config, wsl_distro: "Debian" });
            expect(manager.is_running()).toBe(true);
            expect(manager.is_tripped()).toBe(false);
            expect(mock_fork).toHaveBeenCalledTimes(6);
            manager.stop();
        } finally {
            vi.useRealTimers();
        }
    });

    it("same_config is order-independent (t347 AC-004)", () => {
        const store = create_mock_store();
        const manager = create_token_stats_manager({ store });
        manager.start(base_config);
        // start() posts config once. 键序交换的等价配置应被去重（不再 post）。
        const calls_before = last_child!.postMessage.mock.calls.length;
        const reordered = {
            state_path: base_config.state_path,
            wsl_user: base_config.wsl_user,
            wsl_distro: base_config.wsl_distro,
            wsl_enabled: base_config.wsl_enabled,
            poll_interval_ms: base_config.poll_interval_ms,
            win_home: base_config.win_home,
        };
        manager.update_config(reordered);
        expect(last_child!.postMessage.mock.calls.length).toBe(calls_before);
        manager.stop();
    });

    it("continues remaining batches when one batch fails (t347 AC-002)", async () => {
        const store = create_mock_store();
        const on_update = vi.fn();
        const manager = create_token_stats_manager({ store, on_update });

        manager.start(base_config);
        const sessions = Array.from({ length: 5000 }, (_, i) => ({ id: `s${String(i)}` }));
        // 第一批 upsert_records 抛错，剩余批次继续。
        store.upsert_records.mockImplementationOnce(() => {
            throw new Error("db boom");
        });
        last_child!.emit("message", {
            type: "token_stats_update",
            sessions,
            daily: [],
            records: Array.from({ length: 5000 }, (_, i) => ({ id: `r${String(i)}` })),
        });

        await flush_macrotasks();
        // 失败批次不中断：剩余 records 批次仍处理。
        expect(store.upsert_records).toHaveBeenCalledTimes(3);
        // 全部批次走完后 on_update 仍回调。
        expect(on_update).toHaveBeenCalledTimes(1);
        manager.stop();
    });

    it("仅末批触发 buckets 重建（t396 AC-001）", async () => {
        const store = create_mock_store();
        const manager = create_token_stats_manager({ store });

        manager.start(base_config);
        const sessions = Array.from({ length: 5000 }, (_, i) => ({ id: `s${String(i)}` }));
        last_child!.emit("message", {
            type: "token_stats_update",
            sessions,
            daily: [],
            records: [],
        });

        await flush_macrotasks();
        // 5000 sessions → 3 批（2000+2000+1000）；rebuild_buckets 仅末批 true。
        expect(store.upsert_sessions).toHaveBeenCalledTimes(3);
        const calls = store.upsert_sessions.mock.calls as [unknown, unknown, boolean][];
        expect(calls[0]![2]).toBe(false);
        expect(calls[1]![2]).toBe(false);
        expect(calls[2]![2]).toBe(true);
        manager.stop();
    });

    it("clears pending restart timer on config update after exit (t347 f003)", () => {
        vi.useFakeTimers();
        const store = create_mock_store();
        const manager = create_token_stats_manager({ store });
        manager.start(base_config);
        const first_child = last_child!;

        // 非熔断退出：排 30s 自动重启 timer。
        first_child.emit("exit", 1);
        const forks_after_exit = mock_fork.mock.calls.length;

        // 30s 窗口内配置更新 → 恢复路径立即 start（清 timer，不再用旧 config 重启）。
        manager.update_config({ ...base_config, wsl_distro: "Debian" });
        expect(manager.is_running()).toBe(true);
        expect(mock_fork.mock.calls.length).toBe(forks_after_exit + 1);

        // 推进 30s：旧 timer 已被清，不应再多一次 fork。
        vi.advanceTimersByTime(30_000);
        expect(mock_fork.mock.calls.length).toBe(forks_after_exit + 1);
        manager.stop();
        vi.useRealTimers();
    });
});
