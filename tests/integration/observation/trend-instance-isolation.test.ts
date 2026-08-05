import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { create_observation_store } from "../../../src/main/core/observation/observation-store";
import type { ObservationStore } from "../../../src/main/core/observation/observation-store";
import type { Observation } from "../../../src/shared/types/observation";

/**
 * 回归 t214：同 (provider, account_id, metric_id) 但不同 source_instance_id
 * 的 observation，query_trend_series 必须各自只返回本实例的点，互不串入。
 *
 * 回归现象：tavily 等 12 个 connector 给所有账号写同一个 account_id，账号
 * 真实身份压在 source_instance_id 维度。旧 query_trend_series SQL 不含
 * source_instance_id，多账号采集混桶取随机最新，sparkline 显示错误账号数据。
 */
describe("query_trend_series instance isolation (t214)", () => {
    let temp_dir: string;
    let store: ObservationStore;

    beforeEach(async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "trend-instance-iso-"));
        store = create_observation_store(join(temp_dir, "test.db"));
    });

    afterEach(() => {
        store.close();
        rm(temp_dir, { recursive: true, force: true }).catch(() => undefined);
    });

    function make_obs(overrides: Partial<Observation>): Observation {
        return {
            provider: "tavily",
            source_instance_id: "inst-a",
            account_id: "tavily",
            account_label: "Tavily",
            metric_id: "tavily:total-month",
            raw_label: "total-month",
            normalized_label: "月用量",
            window: "month",
            cycleDurationMs: 30 * 24 * 3_600_000,
            used: 0,
            limit: 1000,
            display_style: "ratio",
            reset_at: null,
            status: "normal",
            observed_at: Date.now(),
            source: "poll",
            stale: false,
            last_error: null,
            ...overrides,
        };
    }

    it("不同 source_instance_id 的 observation 各自隔离，互不串入", () => {
        const now = Date.now();
        // 两个实例，同 provider/account_id/metric_id，不同的 used 值
        store.insert(make_obs({ source_instance_id: "inst-a", used: 100, observed_at: now }));
        store.insert(make_obs({ source_instance_id: "inst-b", used: 500, observed_at: now }));

        const series_a = store.query_trend_series(
            "tavily",
            "tavily",
            "tavily:total-month",
            "inst-a",
            7,
        );
        const series_b = store.query_trend_series(
            "tavily",
            "tavily",
            "tavily:total-month",
            "inst-b",
            7,
        );

        // 两实例都应有数据
        const a_points = series_a.filter((p) => p !== null);
        const b_points = series_b.filter((p) => p !== null);
        expect(a_points.length).toBe(1);
        expect(b_points.length).toBe(1);
        // 各自只含本实例的 used 值，不串
        expect(a_points[0]?.used).toBe(100);
        expect(b_points[0]?.used).toBe(500);
    });

    it("同实例多天采集仍正常，不漏不串", () => {
        const now = Date.now();
        const day_ms = 24 * 60 * 60 * 1000;
        store.insert(make_obs({ source_instance_id: "inst-a", used: 100, observed_at: now }));
        store.insert(
            make_obs({ source_instance_id: "inst-a", used: 200, observed_at: now - 1 * day_ms }),
        );
        // 干扰：另一实例同时间窗
        store.insert(make_obs({ source_instance_id: "inst-b", used: 999, observed_at: now }));

        const series_a = store.query_trend_series(
            "tavily",
            "tavily",
            "tavily:total-month",
            "inst-a",
            7,
        );
        const a_points = series_a.filter((p) => p !== null);
        expect(a_points.length).toBe(2);
        // 不含 inst-b 的 999
        for (const p of a_points) {
            expect(p.used).not.toBe(999);
        }
    });
});
