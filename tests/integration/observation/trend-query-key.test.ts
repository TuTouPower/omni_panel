import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { create_observation_store } from "../../../src/main/core/observation/observation-store";
import type { ObservationStore } from "../../../src/main/core/observation/observation-store";
import { observation_to_metric_record } from "../../../src/main/core/scheduler/observation-mapping";
import type { Observation } from "../../../src/shared/types/observation";

/**
 * 跨层回归：connector 产出的 observation 存入 store 后，前端用 MetricRecord
 * 上承载的查询键（observation 的 metric_id）必须能查回趋势序列。
 *
 * 回归源 p044：前端曾传 period.raw_label 作查询键，与 store 的 metric_id 列
 * （connector 构造的完整键）不一致，sparkline 恒空。
 */
describe("trend query key parity (p044)", () => {
    let temp_dir: string;
    let store: ObservationStore;

    beforeEach(async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "trend-key-parity-"));
        store = create_observation_store(join(temp_dir, "test.db"));
    });

    afterEach(() => {
        store.close();
        rm(temp_dir, { recursive: true, force: true }).catch(() => undefined);
    });

    it("CPA Claude metric_id (含 account_id 段) 能被前端查询键查回趋势", () => {
        const now = Date.now();
        const day_ms = 24 * 60 * 60 * 1000;
        // CPA Claude 形态：metric_id = `claude:${account_id}:${key}`
        const obs_today: Observation = {
            provider: "claude",
            source_instance_id: "cpa-1",
            account_id: "acc-1",
            account_label: "Claude Acc1",
            metric_id: "claude:acc-1:five_hour",
            raw_label: "five_hour",
            normalized_label: "5小时",
            window: "second",
            cycleDurationMs: 5 * 3_600_000,
            used: 30,
            limit: 100,
            display_style: "percent",
            reset_at: null,
            status: "normal",
            observed_at: now,
            source: "gateway",
            stale: false,
            last_error: null,
        };
        store.insert(obs_today);
        store.insert({ ...obs_today, observed_at: now - 1 * day_ms, used: 40 });

        // 前端查询键来源：observation_to_metric_record 产出的 MetricRecord.metric_id
        const rec = observation_to_metric_record(obs_today);
        // contract: MetricRecord 必须承载真实 metric_id（非 raw_label）
        expect(rec.metric_id).toBe("claude:acc-1:five_hour");
        if (rec.metric_id === undefined) throw new Error("metric_id missing");
        const query_metric_id = rec.metric_id;

        const series = store.query_trend_series(
            rec.provider,
            rec.accountId,
            query_metric_id,
            rec.sourceInstanceId,
            7,
        );
        expect(series).toHaveLength(7);
        const non_null = series.filter((p) => p !== null);
        expect(non_null.length).toBeGreaterThanOrEqual(2);
    });

    it("opencode_go metric_id (`provider:raw_label` 形态) 能被前端查询键查回趋势", () => {
        const now = Date.now();
        const day_ms = 24 * 60 * 60 * 1000;
        const obs: Observation = {
            provider: "opencode_go",
            source_instance_id: "opencode_go-1",
            account_id: "ws-1",
            account_label: "Workspace 1",
            metric_id: "opencode_go:monthly",
            raw_label: "monthly",
            normalized_label: "一月",
            window: "month",
            cycleDurationMs: 30 * day_ms,
            used: 0.3,
            limit: 1.0,
            display_style: "ratio",
            reset_at: null,
            status: "normal",
            observed_at: now,
            source: "poll",
            stale: false,
            last_error: null,
        };
        store.insert(obs);
        store.insert({ ...obs, observed_at: now - 2 * day_ms, used: 0.4 });

        const rec = observation_to_metric_record(obs);
        expect(rec.metric_id).toBe("opencode_go:monthly");
        if (rec.metric_id === undefined) throw new Error("metric_id missing");
        const query_metric_id = rec.metric_id;

        const series = store.query_trend_series(
            rec.provider,
            rec.accountId,
            query_metric_id,
            rec.sourceInstanceId,
            7,
        );
        expect(series).toHaveLength(7);
        const non_null = series.filter((p) => p !== null);
        expect(non_null.length).toBeGreaterThanOrEqual(2);
    });

    it("raw_label 作查询键查不到数据（反证：raw_label ≠ metric_id 列）", () => {
        const now = Date.now();
        const obs: Observation = {
            provider: "claude",
            source_instance_id: "cpa-1",
            account_id: "acc-1",
            account_label: "Claude Acc1",
            metric_id: "claude:acc-1:five_hour",
            raw_label: "five_hour",
            normalized_label: "5小时",
            window: "second",
            cycleDurationMs: 5 * 3_600_000,
            used: 30,
            limit: 100,
            display_style: "percent",
            reset_at: null,
            status: "normal",
            observed_at: now,
            source: "gateway",
            stale: false,
            last_error: null,
        };
        store.insert(obs);

        // 用 raw_label 查（旧错误行为）→ 必须查不到
        const series = store.query_trend_series("claude", "acc-1", "five_hour", "cpa-1", 7);
        expect(series.every((p) => p === null)).toBe(true);
    });
});
