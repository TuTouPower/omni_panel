import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
    retention_params,
    run_retention_prune,
    create_retention_scheduler,
    DEFAULT_RETENTION_DAYS,
    RETENTION_INTERVAL_MS,
} from "../../../src/main/core/observation/observation-retention";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_752_000_000_000;

describe("retention_params（t343）", () => {
    it("未设 cacheMaxMb → 仅日期阈值，无行数预算", () => {
        const p = retention_params(undefined, NOW);
        expect(p.older_than_ms).toBe(NOW - DEFAULT_RETENTION_DAYS * DAY_MS);
        expect(p.max_rows).toBeNull();
    });

    it("cacheMaxMb=0（不限制）→ 同未设", () => {
        const p = retention_params(0, NOW);
        expect(p.max_rows).toBeNull();
    });

    it("cacheMaxMb>0 → 行数预算 = mb 折算", () => {
        const p = retention_params(100, NOW);
        expect(p.max_rows).toBe(Math.floor((100 * 1024 * 1024) / 512));
        expect(p.older_than_ms).toBe(NOW - DEFAULT_RETENTION_DAYS * DAY_MS);
    });
});

describe("run_retention_prune（t343）", () => {
    it("按日期阈值 prune，未超预算不追加", () => {
        const pruned_at: number[] = [];
        const removed = run_retention_prune(
            {
                prune: (older_than_ms) => {
                    pruned_at.push(older_than_ms);
                    return 10;
                },
                count_observations: () => 50,
            },
            undefined,
            NOW,
        );
        expect(removed).toBe(10);
        // 仅一次日期阈值调用，无行数收紧追加。
        expect(pruned_at).toEqual([NOW - DEFAULT_RETENTION_DAYS * DAY_MS]);
    });

    it("超行数预算时按时间向前收紧直至回落", () => {
        // cacheMaxMb=1MB → max_rows = 1*1024*1024/512 = 2048；mock 超预算。
        let count = 3000;
        const calls: number[] = [];
        const removed = run_retention_prune(
            {
                prune: (older_than_ms) => {
                    calls.push(older_than_ms);
                    if (count > 2048) {
                        count -= 100;
                        return 100;
                    }
                    return 0;
                },
                count_observations: () => count,
            },
            1,
            NOW,
        );
        // 首步日期阈值删 100 + 收紧 9 步 → 总计 1000 行删除（3000→2000 ≤ 2048）。
        expect(removed).toBe(1000);
        // 首次日期阈值 + 多次收紧，阈值递增（按天向前）。
        expect(calls.length).toBeGreaterThan(2);
        for (let i = 1; i < calls.length; i++) {
            const prev = calls[i - 1];
            const cur = calls[i];
            expect(prev).toBeDefined();
            expect(cur).toBeDefined();
            if (prev === undefined || cur === undefined) throw new Error("calls 越界");
            expect(cur).toBeGreaterThan(prev);
        }
    });

    it("预算不超时不收紧（行数直接满足）", () => {
        let pruned = 0;
        const removed = run_retention_prune(
            {
                prune: (older_than_ms) => {
                    void older_than_ms;
                    pruned += 5;
                    return 5;
                },
                count_observations: () => 10,
            },
            100,
            NOW,
        );
        expect(removed).toBe(5);
        expect(pruned).toBe(5); // 仅日期阈值一次
    });
});

describe("create_retention_scheduler（t343 接线）", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    function make_deps() {
        let count = 50;
        const prune = vi.fn((older_than_ms: number) => {
            void older_than_ms;
            const drop = Math.min(5, count);
            count -= drop;
            return drop;
        });
        return {
            prune,
            count_observations: () => count,
            get_cache_max_mb: () => 100,
            now: () => Date.now(),
        };
    }

    it("start 立即执行一次 prune（启动清理）", () => {
        const deps = make_deps();
        const scheduler = create_retention_scheduler(deps);
        scheduler.start();
        expect(deps.prune).toHaveBeenCalled();
        scheduler.stop();
    });

    it("按 24h 周期再次触发 prune", () => {
        const deps = make_deps();
        const scheduler = create_retention_scheduler(deps);
        scheduler.start();
        const calls_before = deps.prune.mock.calls.length;
        vi.advanceTimersByTime(RETENTION_INTERVAL_MS);
        expect(deps.prune.mock.calls.length).toBeGreaterThan(calls_before);
        scheduler.stop();
    });

    it("stop 清理定时器后不再触发", () => {
        const deps = make_deps();
        const scheduler = create_retention_scheduler(deps);
        scheduler.start();
        scheduler.stop();
        const calls_before = deps.prune.mock.calls.length;
        vi.advanceTimersByTime(RETENTION_INTERVAL_MS * 3);
        expect(deps.prune.mock.calls.length).toBe(calls_before);
    });

    it("prune 抛错被吞并记录（不中断定时器）", () => {
        const deps = make_deps();
        deps.prune.mockImplementation(() => {
            throw new Error("db boom");
        });
        const scheduler = create_retention_scheduler(deps);
        // 启动即执行一次；抛错不应外泄。
        expect(() => {
            scheduler.start();
        }).not.toThrow();
        // 定时器仍存活：推进 24h 再触发不抛。
        expect(() => {
            vi.advanceTimersByTime(RETENTION_INTERVAL_MS);
        }).not.toThrow();
        scheduler.stop();
    });
});
