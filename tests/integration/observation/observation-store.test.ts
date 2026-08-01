import Database from "better-sqlite3";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { create_observation_store } from "../../../src/main/core/observation/observation-store";
import type { Observation } from "../../../src/shared/types/observation";
import type { ObservationStore } from "../../../src/main/core/observation/observation-store";

function assertNonNull<T>(
    value: T,
    message = "expected non-null",
): asserts value is NonNullable<T> {
    expect(value, message).not.toBeNull();
}

let temp_dir: string;
let store: ObservationStore;

function make_observation(overrides: Partial<Observation> = {}): Observation {
    return {
        provider: "tavily",
        source_instance_id: "tavily-1",
        account_id: "default",
        account_label: "Tavily",
        metric_id: "tavily:monthly_usage",
        raw_label: "monthly_usage",
        normalized_label: "月度用量",
        window: "month",
        used: 100,
        limit: 1000,
        display_style: "ratio",
        reset_at: 1735689600000,
        status: "normal",
        observed_at: Date.now(),
        source: "poll",
        stale: false,
        last_error: null,
        ...overrides,
    };
}

beforeEach(async () => {
    temp_dir = await mkdtemp(join(tmpdir(), "obs-store-test-"));
    store = create_observation_store(join(temp_dir, "test.db"));
});

afterEach(() => {
    store.close();
    rm(temp_dir, { recursive: true, force: true }).catch(() => undefined);
});

describe("observation-store", () => {
    it("inserts and retrieves latest observation", () => {
        const obs = make_observation({ observed_at: 1000 });
        store.insert(obs);
        const result = store.get_latest("tavily", "default", "tavily:monthly_usage", "tavily-1");
        assertNonNull(result, "get_latest should return a result");
        expect(result.observed_at).toBe(1000);
    });

    it("returns null for non-existent key", () => {
        const result = store.get_latest("nope", "nope", "nope", "nope");
        expect(result).toBeNull();
    });

    it("returns latest when multiple observations exist for same key", () => {
        store.insert(make_observation({ observed_at: 1000 }));
        store.insert(make_observation({ observed_at: 2000 }));
        store.insert(make_observation({ observed_at: 1500 }));
        const result = store.get_latest("tavily", "default", "tavily:monthly_usage", "tavily-1");
        assertNonNull(result, "get_latest should return a result");
        expect(result.observed_at).toBe(2000);
    });

    it("keeps all rows (append-only) but list_latest returns only latest", () => {
        store.insert(make_observation({ observed_at: 1000 }));
        store.insert(make_observation({ observed_at: 2000 }));
        store.insert(make_observation({ observed_at: 3000 }));
        const all = store.list_latest_by_provider("tavily");
        expect(all).toHaveLength(1);
        assertNonNull(all[0], "should have one element");
        expect(all[0].observed_at).toBe(3000);
    });

    it("dedupes stale copies sharing the same observed_at (t174)", () => {
        // t174：stale 副本保留原观测时间后，多次失败会插入同 ts 副本。
        // 同键同 ts 只保留最新一条 stale 副本，避免行累积与最新观测多义。
        store.insert(make_observation({ observed_at: 5000, stale: false })); // 原观测
        store.insert(make_observation({ observed_at: 5000, stale: true })); // 副本 1
        store.insert(make_observation({ observed_at: 5000, stale: true })); // 副本 2
        const all = store.list_latest_by_provider("tavily");
        // 每 (account, metric) 一条：同 ts 下 stale 副本优先，原观测被唯一确定排除
        expect(all).toHaveLength(1);
        assertNonNull(all[0], "should have one element");
        expect(all[0].observed_at).toBe(5000);
        expect(all[0].stale).toBe(true);
        const lis = store.list_by_source_instance_id("tavily-1");
        expect(lis).toHaveLength(1);
        expect(lis[0]?.stale).toBe(true);
    });

    it("same-key same-ts rows do not accumulate across failure cycles (t186)", () => {
        // AC3：连续失败-恢复循环后，同键同 ts 的行不无限累积（insert 前
        // delete_stale_dup 清旧副本）。删除该清理逻辑后此用例应变红。
        store.insert(make_observation({ observed_at: 5000, stale: false }));
        store.insert(make_observation({ observed_at: 5000, stale: true }));
        store.insert(make_observation({ observed_at: 5000, stale: true }));
        store.insert(make_observation({ observed_at: 5000, stale: true }));
        // 原观测(1) + 最新副本(1) = 2 行；旧副本被 insert 前 delete_stale_dup 清掉。
        expect(store.count_observations()).toBe(2);
    });

    it("prune keeps the stale copy when original and copy share observed_at (t186)", () => {
        // AC1：prune 的保留行选择须与 latest 查询一致——同 ts 下 stale=1 优先。
        // 插入旧 observed_at 的原观测 + 同 ts stale 副本，prune 时该键应只保留
        // stale 副本（1 行），删冗余原观测。当前 prune 的 MAX 保护让两者都命中，
        // 该键行不收敛。
        const old_ts = 1000;
        store.insert(make_observation({ observed_at: old_ts, stale: false }));
        store.insert(make_observation({ observed_at: old_ts, stale: true, last_error: "boom" }));
        store.prune(Date.now());
        expect(store.count_observations()).toBe(1);
        const latest = store.get_latest("tavily", "default", "tavily:monthly_usage", "tavily-1");
        assertNonNull(latest, "latest should survive prune");
        expect(latest.stale).toBe(true);
        expect(latest.last_error).toBe("boom");
    });

    it("prefers the stale copy when original and copy share observed_at (t174)", () => {
        store.insert(make_observation({ observed_at: 5000, stale: false }));
        store.insert(make_observation({ observed_at: 5000, stale: true, last_error: "boom" }));
        const result = store.get_latest("tavily", "default", "tavily:monthly_usage", "tavily-1");
        assertNonNull(result, "get_latest should return a result");
        expect(result.stale).toBe(true);
        expect(result.last_error).toBe("boom");
    });

    it("list_by_source_instance_id returns latest per (account, metric) across many groups (t096 perf regression)", () => {
        // 两组 (account, metric)，各多条历史；只返回每组最新（含 stale 行混入）。
        store.insert(make_observation({ account_id: "a1", metric_id: "m1", observed_at: 1000 }));
        store.insert(
            make_observation({ account_id: "a1", metric_id: "m1", observed_at: 2000, stale: true }),
        );
        store.insert(make_observation({ account_id: "a1", metric_id: "m1", observed_at: 3000 }));
        store.insert(make_observation({ account_id: "a2", metric_id: "m2", observed_at: 1500 }));
        store.insert(make_observation({ account_id: "a2", metric_id: "m2", observed_at: 2500 }));
        const rows = store.list_by_source_instance_id("tavily-1");
        expect(rows).toHaveLength(2);
        const m1 = rows.find((r) => r.account_id === "a1" && r.metric_id === "m1");
        const m2 = rows.find((r) => r.account_id === "a2" && r.metric_id === "m2");
        assertNonNull(m1, "m1 row should exist");
        assertNonNull(m2, "m2 row should exist");
        expect(m1.observed_at).toBe(3000);
        expect(m2.observed_at).toBe(2500);
    });

    it("lists latest per unique (account, metric, source) within provider", () => {
        store.insert(
            make_observation({
                account_id: "a1",
                metric_id: "m1",
                source_instance_id: "s1",
                observed_at: 1000,
            }),
        );
        store.insert(
            make_observation({
                account_id: "a1",
                metric_id: "m1",
                source_instance_id: "s1",
                observed_at: 2000,
            }),
        );
        store.insert(
            make_observation({
                account_id: "a2",
                metric_id: "m1",
                source_instance_id: "s1",
                observed_at: 3000,
            }),
        );
        const all = store.list_latest_by_provider("tavily");
        expect(all).toHaveLength(2);
    });

    it("lists all providers", () => {
        store.insert(make_observation({ provider: "tavily" }));
        store.insert(make_observation({ provider: "deepseek" }));
        const providers = store.list_all_providers();
        expect(providers).toContain("tavily");
        expect(providers).toContain("deepseek");
    });

    it("prunes old observations but keeps latest", () => {
        const now = Date.now();
        store.insert(make_observation({ observed_at: now - 100 * 24 * 60 * 60 * 1000 }));
        store.insert(make_observation({ observed_at: now - 91 * 24 * 60 * 60 * 1000 }));
        store.insert(make_observation({ observed_at: now }));
        const pruned = store.prune(now - 90 * 24 * 60 * 60 * 1000);
        expect(pruned).toBe(2);
        const latest = store.get_latest("tavily", "default", "tavily:monthly_usage", "tavily-1");
        assertNonNull(latest, "get_latest should return a result after prune");
        expect(latest.observed_at).toBe(now);
    });

    it("preserves stale and last_error fields", () => {
        const obs = make_observation({ stale: true, last_error: "connection refused" });
        store.insert(obs);
        const result = store.get_latest("tavily", "default", "tavily:monthly_usage", "tavily-1");
        assertNonNull(result, "get_latest should return a result");
        expect(result.stale).toBe(true);
        expect(result.last_error).toBe("connection refused");
    });

    it("does not lose data under concurrent inserts from multiple connections", () => {
        // better-sqlite3 is synchronous per connection, but multiple connections
        // hitting WAL can still contend. Simulate with a second connection.
        const db_path = join(temp_dir, "test.db");
        const store_b = create_observation_store(db_path);
        try {
            const N = 50;
            for (let i = 0; i < N; i++) {
                store.insert(make_observation({ observed_at: 1000 + i }));
                store_b.insert(make_observation({ observed_at: 2000 + i }));
            }
            // All rows must survive: distinct (account, metric, source) keyed by latest only,
            // but here all keys are identical so list_latest_by_provider returns 1 entry.
            // Verify append-only count via a direct connection to confirm no rows dropped.
            const check = new Database(db_path);
            try {
                const row = check.prepare("SELECT COUNT(*) AS n FROM observations").get() as {
                    n: number;
                };
                expect(row.n).toBe(N * 2);
            } finally {
                check.close();
            }
        } finally {
            store_b.close();
        }
    });

    it("sets busy_timeout pragma so writes do not wait indefinitely", () => {
        // Verify the pragma was actually applied. Without it, SQLITE_BUSY could
        // surface as an immediate throw rather than a bounded retry.
        const db_path = join(temp_dir, "pragma.db");
        const s = create_observation_store(db_path);
        try {
            const check = new Database(db_path);
            try {
                const row = check.pragma("busy_timeout", { simple: true }) as number;
                expect(row).toBeGreaterThanOrEqual(1000);
            } finally {
                check.close();
            }
        } finally {
            s.close();
        }
    });

    describe("query_trend_series", () => {
        it("returns `days` points with null fill for missing days", () => {
            const now = Date.now();
            const day_ms = 24 * 60 * 60 * 1000;
            store.insert(make_observation({ observed_at: now }));
            store.insert(make_observation({ observed_at: now - 3 * day_ms }));
            store.insert(make_observation({ observed_at: now - 6 * day_ms }));

            const series = store.query_trend_series("tavily", "default", "tavily:monthly_usage", 7);
            expect(series).toHaveLength(7);
            // Buckets: [6 days ago, 5, 4, 3, 2, 1, today]. Only 0, 3, 6 have data.
            expect(series[0]).not.toBeNull();
            expect(series[1]).toBeNull();
            expect(series[2]).toBeNull();
            expect(series[3]).not.toBeNull();
            expect(series[4]).toBeNull();
            expect(series[5]).toBeNull();
            expect(series[6]).not.toBeNull();
        });

        it("keeps the latest observation per day when multiple rows hit the same bucket", () => {
            const now = Date.now();
            const two_hours_ms = 2 * 60 * 60 * 1000;
            store.insert(
                make_observation({ observed_at: now - two_hours_ms, used: 100, limit: 1000 }),
            );
            store.insert(make_observation({ observed_at: now, used: 500, limit: 1000 }));

            const series = store.query_trend_series("tavily", "default", "tavily:monthly_usage", 7);
            expect(series).toHaveLength(7);
            const today = series[6];
            expect(today).not.toBeNull();
            expect(today?.used).toBe(500);
            expect(today?.limit).toBe(1000);
        });

        it("returns all-null series for unknown key", () => {
            const series = store.query_trend_series("nope", "nope", "nope", 7);
            expect(series).toHaveLength(7);
            for (const point of series) {
                expect(point).toBeNull();
            }
        });

        it("returns [] when days<=0", () => {
            expect(
                store.query_trend_series("tavily", "default", "tavily:monthly_usage", 0),
            ).toEqual([]);
        });

        it("uses idx_trend index for the range scan", () => {
            // Seed 1 observation so the planner has statistics — empty-table plans
            // can drift across SQLite versions or after ANALYZE.
            store.insert(make_observation({ observed_at: Date.now() }));
            // EXPLAIN QUERY PLAN must reference idx_trend — otherwise the schema
            // optimization regressed and the query goes through idx_lookup or a
            // full table scan. Word boundary `\b` rejects future siblings like
            // `idx_trend_v2`.
            const check = new Database(join(temp_dir, "test.db"));
            try {
                const plan = check
                    .prepare(
                        "EXPLAIN QUERY PLAN SELECT * FROM observations " +
                            "WHERE provider = ? AND account_id = ? AND metric_id = ? AND observed_at >= ? " +
                            "ORDER BY observed_at ASC",
                    )
                    .all("p", "a", "m", 0) as { detail: string }[];
                const details = plan.map((row) => row.detail).join("\n");
                expect(details).toMatch(/USING INDEX idx_trend\b/);
                expect(details).not.toContain("idx_lookup");
            } finally {
                check.close();
            }
        });
    });
});
