/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

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
};

function create_mock_store() {
    return {
        upsert_sessions: vi.fn(),
        upsert_records: vi.fn(),
        query_buckets: vi.fn(() => []),
        query_sessions: vi.fn(() => []),
        query_records: vi.fn(() => []),
        last_updated: vi.fn(() => null),
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

    it("stores session deltas + daily rows on update message and fires on_update", () => {
        const store = create_mock_store();
        const on_update = vi.fn();
        const manager = create_token_stats_manager({ store, on_update });

        manager.start(base_config);
        last_child!.emit("message", {
            type: "token_stats_update",
            sessions: [{ id: "s1" }],
            daily: [{ id: "s1", date: "2026-07-17" }],
        });

        expect(store.upsert_sessions).toHaveBeenCalledWith(
            [{ id: "s1" }],
            [{ id: "s1", date: "2026-07-17" }],
        );
        expect(on_update).toHaveBeenCalledTimes(1);
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

    it("stop kills the child", () => {
        const store = create_mock_store();
        const manager = create_token_stats_manager({ store });

        manager.start(base_config);
        const child_ref = last_child!;
        manager.stop();

        expect(child_ref.kill).toHaveBeenCalledTimes(1);
        expect(manager.is_running()).toBe(false);
    });
});
