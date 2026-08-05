import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { create_observation_store } from "../../../src/main/core/observation/observation-store";
import type { ObservationStore } from "../../../src/main/core/observation/observation-store";
import type { Observation } from "../../../src/shared/types/observation";

/**
 * t208: query_trend_series 按固定 ≤max_points 桶均分窗口取最新，不再按天压缩。
 * 存储细粒度（30min 采集），折线应反映多次采集而非一天一点。
 */
describe("query_trend_series granularity (t208)", () => {
    let temp_dir: string;
    let store: ObservationStore;

    beforeEach(async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "trend-granularity-"));
        store = create_observation_store(join(temp_dir, "test.db"));
    });

    afterEach(() => {
        store.close();
        rm(temp_dir, { recursive: true, force: true }).catch(() => undefined);
    });

    function make_obs(overrides: Partial<Observation>): Observation {
        return {
            provider: "claude",
            source_instance_id: "inst-a",
            account_id: "acc-a",
            account_label: "Acc",
            metric_id: "claude:acc-a:5h",
            raw_label: "5h",
            normalized_label: "5h",
            window: "second",
            cycleDurationMs: 5 * 3_600_000,
            used: 0,
            limit: 100,
            display_style: "percent",
            reset_at: null,
            status: "normal",
            observed_at: Date.now(),
            source: "gateway",
            stale: false,
            last_error: null,
            ...overrides,
        };
    }

    it("1 天窗口内 48 次 30min 采集返回 >1 点（按细粒度，非一天一点）", () => {
        const now = Date.now();
        const half_hour = 30 * 60 * 1000;
        // 过去 24h，每 30min 一次，48 次
        for (let i = 47; i >= 0; i--) {
            store.insert(make_obs({ used: i, observed_at: now - i * half_hour }));
        }
        const series = store.query_trend_series("claude", "acc-a", "claude:acc-a:5h", "inst-a", 1);
        const points = series;
        // 关键：不再是 1 个点（旧按天分桶），应反映多次采集
        expect(points.length).toBeGreaterThan(1);
    });

    it("返回点数 ≤ max_points（默认 120）", () => {
        const now = Date.now();
        const min = 60 * 1000;
        // 7 天窗口，每分钟一次 = 10080 点，远超 120
        for (let i = 10079; i >= 0; i--) {
            store.insert(make_obs({ used: i, observed_at: now - i * min }));
        }
        const series = store.query_trend_series("claude", "acc-a", "claude:acc-a:5h", "inst-a", 7);
        expect(series.length).toBeLessThanOrEqual(120);
    });

    it("原始点数 < max_points 时不聚合，按实际点数返回", () => {
        const now = Date.now();
        // 仅 3 个点
        store.insert(make_obs({ used: 10, observed_at: now - 2 * 3600_000 }));
        store.insert(make_obs({ used: 20, observed_at: now - 3600_000 }));
        store.insert(make_obs({ used: 30, observed_at: now }));
        const series = store.query_trend_series("claude", "acc-a", "claude:acc-a:5h", "inst-a", 1);
        const points = series;
        expect(points.length).toBe(3);
    });

    it("聚合分支：>cap 点同桶取 observed_at 最大一条（t208 同桶语义）", () => {
        const now = Date.now();
        // 121 点全落在最末桶（now 附近 11min 内），触发聚合（>120）。
        // 最末桶宽 = 24h/120 = 12min；now-5min 与 now-1min 同属最末桶。
        // used=10 在早（now-5min），used=90 在晚（now-1min，最新）；其余 119 点 used=50。
        for (let i = 0; i < 119; i++) {
            store.insert(make_obs({ used: 50, observed_at: now - 5 * 60_000 - i * 1000 }));
        }
        store.insert(make_obs({ used: 10, observed_at: now - 5 * 60_000 }));
        store.insert(make_obs({ used: 90, observed_at: now - 60_000 })); // 最末桶最新
        const series = store.query_trend_series("claude", "acc-a", "claude:acc-a:5h", "inst-a", 1);
        // 121 点 > 120 → 聚合，最末桶只保留 observed_at 最大（used=90）。
        const last_bucket = series[series.length - 1];
        expect(last_bucket).toBeDefined();
        if (!last_bucket) throw new Error("empty series");
        expect(last_bucket.used).toBe(90);
    });
});
