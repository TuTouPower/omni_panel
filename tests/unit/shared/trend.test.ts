import { describe, expect, it } from "vitest";

import type { Observation } from "../../../src/shared/types/observation";
import { build_trend_series, format_utc_date } from "../../../src/shared/lib/trend";

function make_obs(overrides: Partial<Observation> = {}): Observation {
    return {
        provider: "tavily",
        source_instance_id: "tavily-1",
        account_id: "default",
        account_label: "Tavily",
        metric_id: "monthly_usage",
        raw_label: "monthly_usage",
        normalized_label: "月度用量",
        window: "month",
        used: 100,
        limit: 1000,
        display_style: "ratio",
        reset_at: null,
        status: "normal",
        observed_at: Date.UTC(2026, 6, 20),
        source: "poll",
        stale: false,
        last_error: null,
        ...overrides,
    };
}

describe("build_trend_series", () => {
    it("maps 7 ascending points to {date, percent}", () => {
        const day_ms = 24 * 60 * 60 * 1000;
        const base = Date.UTC(2026, 6, 20);
        const records = [
            make_obs({ observed_at: base - 6 * day_ms, used: 100, limit: 1000 }),
            make_obs({ observed_at: base - 5 * day_ms, used: 200, limit: 1000 }),
            make_obs({ observed_at: base - 4 * day_ms, used: 300, limit: 1000 }),
            make_obs({ observed_at: base - 3 * day_ms, used: 400, limit: 1000 }),
            make_obs({ observed_at: base - 2 * day_ms, used: 500, limit: 1000 }),
            make_obs({ observed_at: base - 1 * day_ms, used: 600, limit: 1000 }),
            make_obs({ observed_at: base - 0 * day_ms, used: 700, limit: 1000 }),
        ];
        const series = build_trend_series(records);
        expect(series).toHaveLength(7);
        expect(series[0]?.date).toBe("2026-07-14");
        expect(series[0]?.percent).toBe(10);
        expect(series[6]?.date).toBe("2026-07-20");
        expect(series[6]?.percent).toBe(70);
    });

    it("preserves nulls for missing days", () => {
        const day_ms = 24 * 60 * 60 * 1000;
        const base = Date.UTC(2026, 6, 20);
        const records: (Observation | null)[] = [
            null,
            make_obs({ observed_at: base - 5 * day_ms, used: 200, limit: 1000 }),
            null,
            make_obs({ observed_at: base - 3 * day_ms, used: 400, limit: 1000 }),
            null,
            make_obs({ observed_at: base - 1 * day_ms, used: 600, limit: 1000 }),
            null,
        ];
        const series = build_trend_series(records);
        expect(series).toHaveLength(7);
        expect(series[0]).toBeNull();
        expect(series[1]?.percent).toBe(20);
        expect(series[2]).toBeNull();
        expect(series[3]?.percent).toBe(40);
        expect(series[4]).toBeNull();
        expect(series[5]?.percent).toBe(60);
        expect(series[6]).toBeNull();
    });

    it("returns the actual length when records shorter than days", () => {
        const records = [
            make_obs({ observed_at: Date.UTC(2026, 6, 19), used: 50, limit: 100 }),
            make_obs({ observed_at: Date.UTC(2026, 6, 20), used: 60, limit: 100 }),
        ];
        const series = build_trend_series(records);
        expect(series).toHaveLength(2);
    });

    it("returns empty array for empty input", () => {
        const series = build_trend_series([]);
        expect(series).toEqual([]);
    });

    it("applies used/limit formula regardless of display_style", () => {
        // Implementation does NOT read display_style — ratio and percent both use
        // used/limit*100. Locking this with a ratio-vs-percent contrast: same
        // used/limit ratio must yield the same percent regardless of display_style.
        const ratio_records = [
            make_obs({
                observed_at: Date.UTC(2026, 6, 20),
                used: 25,
                limit: 200,
                display_style: "ratio",
            }),
        ];
        const percent_records = [
            make_obs({
                observed_at: Date.UTC(2026, 6, 20),
                used: 25,
                limit: 200,
                display_style: "percent",
            }),
        ];
        const ratio_series = build_trend_series(ratio_records);
        const percent_series = build_trend_series(percent_records);
        expect(ratio_series[0]?.percent).toBe(13); // Math.round(25/200*100) = 13
        expect(percent_series[0]?.percent).toBe(ratio_series[0]?.percent);
    });

    it("clamps percent to 0-100", () => {
        const records = [
            make_obs({ observed_at: Date.UTC(2026, 6, 19), used: -50, limit: 100 }),
            make_obs({ observed_at: Date.UTC(2026, 6, 20), used: 200, limit: 100 }),
        ];
        const series = build_trend_series(records);
        expect(series[0]?.percent).toBe(0);
        expect(series[1]?.percent).toBe(100);
    });

    it("returns null when used/limit is null or limit<=0", () => {
        const records = [
            make_obs({ observed_at: Date.UTC(2026, 6, 18), used: 50, limit: null }),
            make_obs({ observed_at: Date.UTC(2026, 6, 19), used: 50, limit: 0 }),
            make_obs({ observed_at: Date.UTC(2026, 6, 20), used: null, limit: 100 }),
        ];
        const series = build_trend_series(records);
        expect(series).toHaveLength(3);
        expect(series[0]).toBeNull();
        expect(series[1]).toBeNull();
        expect(series[2]).toBeNull();
    });
});

describe("format_utc_date", () => {
    it("pads month and day", () => {
        expect(format_utc_date(new Date(Date.UTC(2026, 0, 5)))).toBe("2026-01-05");
        expect(format_utc_date(new Date(Date.UTC(2026, 6, 20)))).toBe("2026-07-20");
    });
});
