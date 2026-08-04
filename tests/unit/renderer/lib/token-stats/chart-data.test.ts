import { describe, it, expect } from "vitest";
import type {
    AgentSessionUsage,
    TokenStatsBucket,
    TokenStatsDashboardChartData,
    TokenStatsHeatmapCell,
    TokenStatsHourBucket,
    TokenStatsRollupRow,
    TokenStatsSession,
} from "../../../../../src/shared/types/token-stats";
import type { Metric } from "../../../../../src/renderer/lib/token-stats/types";
import {
    agentSegments,
    agentSegmentsFromBuckets,
    agentSegmentsFromRollup,
    compositionSegments,
    compositionSegmentsFromBuckets,
    compositionSegmentsFromRollup,
    escapeHtml,
    hitRateOfRollup,
    kpiFromBuckets,
    kpiFromRollup,
    modelColorMap,
    modelSegments,
    modelSegmentsFromBuckets,
    modelSegmentsFromRollup,
    prepareBarData,
    prepareBarDataFromBuckets,
    prepareBarDataFromHourBuckets,
    prepareBarDataFromRollup,
    prepareBarDataFromDashboardChartData,
    prepareBarDataFromDashboardRollup,
    prepareHeatmapData,
    prepareHeatmapFromCells,
    projectSegments,
    projectSegmentsFromSessions,
    rollupCallValue,
    sumTokensRollup,
    sumTokensValue,
} from "../../../../../src/renderer/lib/token-stats/chart-data";

function record(overrides: Partial<AgentSessionUsage> = {}): AgentSessionUsage {
    return {
        session_id: "s1",
        title: null,
        directory: null,
        slug: null,
        version: null,
        parent_session_id: null,
        message_id: "m1",
        role: "assistant",
        timestamp: 1000,
        model: "claude-sonnet-4",
        input_tokens: 10,
        output_tokens: 5,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        agent: "claude-code",
        ...overrides,
    };
}

describe("escapeHtml", () => {
    it("escapes XSS-relevant characters", () => {
        expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
            "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
        );
        expect(escapeHtml(`<img onerror='a' src=b>`)).toBe("&lt;img onerror=&#39;a&#39; src=b&gt;");
        expect(escapeHtml("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
    });

    it("leaves safe text unchanged", () => {
        expect(escapeHtml("claude-code 项目 X")).toBe("claude-code 项目 X");
    });
});

describe("agentSegments", () => {
    it("sums tokens per agent and skips agents with no usage", () => {
        const records = [
            record({ agent: "claude-code", input_tokens: 100, output_tokens: 50 }),
            record({ agent: "claude-code", input_tokens: 10 }),
            record({ agent: "opencode", input_tokens: 30, output_tokens: 10 }),
            record({ agent: "kimi-code", input_tokens: 5 }),
            record({ agent: "grok", input_tokens: 70, output_tokens: 20 }),
        ];
        const segs = agentSegments(records);
        const byName = new Map(segs.map((s) => [s.name, s.value]));
        // claude-code: (100+50) + (10+5 default out) = 165; cache excluded
        expect(byName.get("Claude Code")).toBe(165);
        expect(byName.get("OpenCode")).toBe(40);
        expect(byName.get("Kimi Code")).toBe(10);
        expect(byName.get("Grok")).toBe(90);
        expect(segs).toHaveLength(4);
    });
});

describe("chart-data", () => {
    describe("modelSegments", () => {
        it("groups records by model and returns top 5 + others", () => {
            const records = [
                record({ model: "a", input_tokens: 100 }),
                record({ model: "b", input_tokens: 80 }),
                record({ model: "c", input_tokens: 60 }),
                record({ model: "d", input_tokens: 40 }),
                record({ model: "e", input_tokens: 30 }),
                record({ model: "f", input_tokens: 20 }),
                record({ model: "g", input_tokens: 10 }),
            ];
            const segs = modelSegments(records, sumTokensValue, "dark");
            expect(segs).toHaveLength(6);
            expect(segs.slice(0, 5).map((s) => s.name)).toEqual(["a", "b", "c", "d", "e"]);
            expect(segs.slice(0, 5).map((s) => s.itemStyle.color)).toEqual([
                "#7c6cf6",
                "#4cc2ff",
                "#3ddc97",
                "#ffb454",
                "#f56cc6",
            ]);
            const other = segs[5];
            if (!other) throw new Error("expected other segment");
            expect(other.name).toContain("其他");
            expect(other.value).toBe(40);
            expect(other.itemStyle.color).toBe("#46506a");
        });

        it("omits the 'other' bucket when there are 5 or fewer models", () => {
            const records = [record({ model: "a" }), record({ model: "b" })];
            const segs = modelSegments(records, sumTokensValue, "dark");
            expect(segs).toHaveLength(2);
            expect(segs.every((s) => !s.name.includes("其他"))).toBe(true);
        });
    });

    describe("compositionSegments", () => {
        it("returns the four token kinds", () => {
            const records = [
                record({
                    input_tokens: 10,
                    output_tokens: 5,
                    cache_read_tokens: 3,
                    cache_write_tokens: 2,
                }),
            ];
            const segs = compositionSegments(records);
            const byName = new Map(segs.map((s) => [s.name, s.value]));
            expect(byName.get("input")).toBe(10);
            expect(byName.get("output")).toBe(5);
            expect(byName.get("cache_read")).toBe(3);
            expect(byName.get("cache_write")).toBe(2);
        });
    });

    describe("projectSegments", () => {
        it("counts unique sessions per directory", () => {
            const records = [
                record({ directory: "/a", session_id: "x" }),
                record({ directory: "/a", session_id: "x" }),
                record({ directory: "/a", session_id: "y" }),
                record({ directory: "/b", session_id: "z" }),
            ];
            const segs = projectSegments(records, "dark");
            const byName = new Map(segs.map((s) => [s.name, s.value]));
            expect(byName.get("a")).toBe(2);
            expect(byName.get("b")).toBe(1);
        });

        it("uses Top5 high-contrast colors and groups the rest as 其他", () => {
            const records = [
                record({ directory: "/a", session_id: "a1" }),
                record({ directory: "/b", session_id: "b1" }),
                record({ directory: "/c", session_id: "c1" }),
                record({ directory: "/d", session_id: "d1" }),
                record({ directory: "/e", session_id: "e1" }),
                record({ directory: "/f", session_id: "f1" }),
                record({ directory: "/g", session_id: "g1" }),
            ];
            const segs = projectSegments(records, "dark");
            expect(segs).toHaveLength(6);
            expect(segs.slice(0, 5).map((s) => s.itemStyle.color)).toEqual([
                "#7c6cf6",
                "#4cc2ff",
                "#3ddc97",
                "#ffb454",
                "#f56cc6",
            ]);
            expect(segs[5]?.name).toContain("其他");
            expect(segs[5]?.itemStyle.color).toBe("#46506a");
        });
    });

    describe("modelColorMap", () => {
        it("maps the top 5 models by metric to the high-contrast palette", () => {
            const records = [
                record({ model: "a", input_tokens: 100 }),
                record({ model: "b", input_tokens: 80 }),
                record({ model: "c", input_tokens: 60 }),
                record({ model: "d", input_tokens: 40 }),
                record({ model: "e", input_tokens: 30 }),
                record({ model: "f", input_tokens: 20 }),
            ];
            const map = modelColorMap(records, "tokens", "dark");
            expect(map.get("a")).toBe("#7c6cf6");
            expect(map.get("e")).toBe("#f56cc6");
            expect(map.has("f")).toBe(false);
        });
    });

    describe("prepareBarData", () => {
        it("creates time buckets for token metric", () => {
            const start = new Date("2026-07-10T00:00:00").getTime();
            const end = new Date("2026-07-13T00:00:00").getTime();
            const records = [record({ timestamp: start + 3600000, input_tokens: 100 })];
            const data = prepareBarData(records, "tokens", "time", "day", start, end, "dark");
            expect(data.labels).toEqual(["7/10", "7/11", "7/12"]);
            expect(data.series).toHaveLength(1);
            const firstSeries = data.series[0];
            if (!firstSeries) throw new Error("expected first series");
            expect(firstSeries.data[0]).toBe(105);
        });

        it("keeps natural bucket starts and routes records across partial day buckets", () => {
            const start = new Date("2026-07-17T15:30:00").getTime();
            const end = new Date("2026-07-24T15:30:00").getTime();
            const records = [
                record({ timestamp: new Date("2026-07-17T16:00:00").getTime(), input_tokens: 100 }),
                record({ timestamp: new Date("2026-07-18T01:00:00").getTime(), input_tokens: 100 }),
                record({ timestamp: new Date("2026-07-24T10:00:00").getTime(), input_tokens: 100 }),
            ];
            const data = prepareBarData(records, "tokens", "time", "day", start, end, "dark");

            expect(data.labels).toEqual([
                "7/17",
                "7/18",
                "7/19",
                "7/20",
                "7/21",
                "7/22",
                "7/23",
                "7/24",
            ]);
            expect(data.bucketStarts).toEqual([
                start,
                new Date("2026-07-18T00:00:00").getTime(),
                new Date("2026-07-19T00:00:00").getTime(),
                new Date("2026-07-20T00:00:00").getTime(),
                new Date("2026-07-21T00:00:00").getTime(),
                new Date("2026-07-22T00:00:00").getTime(),
                new Date("2026-07-23T00:00:00").getTime(),
                new Date("2026-07-24T00:00:00").getTime(),
            ]);
            const firstSeries = data.series[0];
            if (!firstSeries) throw new Error("expected first series");
            expect(firstSeries.data).toEqual([105, 105, 0, 0, 0, 0, 0, 105]);
        });

        it("routes partial-hour records into twenty-five time-axis buckets", () => {
            const start = new Date("2026-07-23T15:30:00").getTime();
            const end = new Date("2026-07-24T15:30:00").getTime();
            const records = [
                record({ timestamp: new Date("2026-07-23T15:45:00").getTime(), input_tokens: 100 }),
                record({ timestamp: new Date("2026-07-24T05:00:00").getTime(), input_tokens: 100 }),
                record({ timestamp: new Date("2026-07-24T15:10:00").getTime(), input_tokens: 100 }),
            ];
            const data = prepareBarData(records, "tokens", "time", "hour", start, end, "dark");
            const firstSeries = data.series[0];
            if (!firstSeries) throw new Error("expected first series");

            expect(data.labels).toHaveLength(25);
            expect(data.labels[0]).toBe("7/23 15:00");
            expect(data.labels[14]).toBe("7/24 05:00");
            expect(data.labels[24]).toBe("7/24 15:00");
            expect(data.bucketStarts).toHaveLength(25);
            expect(data.bucketStarts[0]).toBe(start);
            expect(data.bucketStarts[14]).toBe(new Date("2026-07-24T05:00:00").getTime());
            expect(data.bucketStarts[24]).toBe(new Date("2026-07-24T15:00:00").getTime());
            expect(firstSeries.data[0]).toBe(105);
            expect(firstSeries.data[14]).toBe(105);
            expect(firstSeries.data[24]).toBe(105);
        });

        it("creates thirty-one natural day buckets through the bar-data path", () => {
            const start = new Date("2026-06-24T15:30:00").getTime();
            const end = new Date("2026-07-24T15:30:00").getTime();
            const data = prepareBarData([], "tokens", "time", "day", start, end, "dark");

            expect(data.labels).toHaveLength(31);
            expect(data.labels[0]).toBe("6/24");
            expect(data.labels[30]).toBe("7/24");
            expect(data.bucketStarts[0]).toBe(start);
            expect(data.bucketStarts[30]).toBe(new Date("2026-07-24T00:00:00").getTime());
        });

        it("projects sessions by directory when metric is sessions", () => {
            const records = [
                record({ directory: "/a", session_id: "x" }),
                record({ directory: "/a", session_id: "x" }),
                record({ directory: "/b", session_id: "y" }),
            ];
            const data = prepareBarData(records, "sessions", "project", "day", 0, 1, "dark");
            expect(data.labels).toEqual(["a", "b"]);
            expect(data.seriesNames).toContain("/a");
            expect(data.seriesNames).toContain("/b");
        });

        it("sessions bar series use top-5 colors, not the gray fallback", () => {
            const records = [
                record({ directory: "/a", session_id: "x" }),
                record({ directory: "/b", session_id: "y" }),
                record({ directory: "/c", session_id: "z" }),
            ];
            const data = prepareBarData(records, "sessions", "project", "day", 0, 1, "dark");
            const gray = "#6b7890";
            for (const s of data.series) {
                if (s.name !== "其他") {
                    expect(s.itemStyle.color).not.toBe(gray);
                }
            }
        });

        it("groups directories by alias in project xaxis", () => {
            const records = [
                record({ directory: "/a", input_tokens: 10, output_tokens: 0 }),
                record({ directory: "/b", input_tokens: 20, output_tokens: 0 }),
                record({ directory: "/c", input_tokens: 5, output_tokens: 0 }),
            ];
            const data = prepareBarData(records, "tokens", "project", "day", 0, 1, "dark", [
                { alias: "proj-x", dirs: ["/a", "/b"] },
            ]);
            expect(data.labels).toContain("proj-x");
            const proj_idx = data.labels.indexOf("proj-x");
            const total = data.series.reduce((sum, s) => sum + (s.data[proj_idx] ?? 0), 0);
            expect(total).toBe(30);
        });
    });

    describe("prepareBarDataFromBuckets", () => {
        it("lays day buckets out on a date axis and stacks by model", () => {
            const start = new Date("2026-07-10T00:00:00Z").getTime();
            const end = new Date("2026-07-12T23:59:59Z").getTime();
            const buckets = [
                bucket({ bucket_date: "2026-07-10", model: "sonnet", input_tokens: 100 }),
                bucket({ bucket_date: "2026-07-10", model: "opus", input_tokens: 50 }),
                bucket({ bucket_date: "2026-07-11", model: "sonnet", input_tokens: 80 }),
                bucket({ bucket_date: "2026-07-12", model: "haiku", input_tokens: 10 }),
            ];
            const data = prepareBarDataFromBuckets(buckets, "tokens", start, end, "dark");
            // 3 day labels (07-10..07-12)
            expect(data.labels).toHaveLength(3);
            // total per day: 150, 80, 10
            const totals = data.series.reduce<Record<number, number>>((acc, s) => {
                s.data.forEach((v, i) => {
                    acc[i] = (acc[i] ?? 0) + v;
                });
                return acc;
            }, {});
            expect(totals[0]).toBe(150);
            expect(totals[1]).toBe(80);
            expect(totals[2]).toBe(10);
        });

        it("skips buckets outside the window", () => {
            const start = new Date("2026-07-10T00:00:00Z").getTime();
            const end = new Date("2026-07-10T23:59:59Z").getTime();
            const buckets = [
                bucket({ bucket_date: "2026-07-10", input_tokens: 100 }),
                bucket({ bucket_date: "2026-07-09", input_tokens: 999 }),
                bucket({ bucket_date: "2026-07-11", input_tokens: 999 }),
            ];
            const data = prepareBarDataFromBuckets(buckets, "tokens", start, end, "dark");
            expect(data.labels).toHaveLength(1);
            const total = data.series.reduce((sum, s) => sum + (s.data[0] ?? 0), 0);
            expect(total).toBe(100);
        });
    });

    describe("prepareBarDataFromHourBuckets", () => {
        function hb(overrides: Partial<TokenStatsHourBucket> = {}): TokenStatsHourBucket {
            return {
                hour_start: new Date("2026-07-10T02:00:00Z").getTime(),
                model: "claude-sonnet-4",
                calls: 3,
                sessions: 2,
                tokens: 500,
                ...overrides,
            };
        }

        it("lays hour buckets on the bucketize axis and stacks by model", () => {
            const start = new Date("2026-07-10T01:30:00Z").getTime();
            const end = new Date("2026-07-10T04:30:00Z").getTime();
            const buckets = [
                // hour 01:00 (start is 01:30) → partial first bucket via idx(ts<=start)→0
                hb({
                    hour_start: new Date("2026-07-10T01:00:00Z").getTime(),
                    model: "claude-sonnet-4",
                    tokens: 100,
                }),
                hb({
                    hour_start: new Date("2026-07-10T02:00:00Z").getTime(),
                    model: "claude-sonnet-4",
                    tokens: 200,
                }),
                hb({
                    hour_start: new Date("2026-07-10T03:00:00Z").getTime(),
                    model: "opus",
                    tokens: 50,
                }),
            ];
            const data = prepareBarDataFromHourBuckets(buckets, "tokens", start, end, "dark");
            // bucketize hour boundaries: [01:30, 02:00, 03:00, 04:00] → 4 buckets
            expect(data.labels).toHaveLength(4);
            const totals = data.series.reduce<Record<number, number>>((acc, s) => {
                s.data.forEach((v, i) => {
                    acc[i] = (acc[i] ?? 0) + v;
                });
                return acc;
            }, {});
            expect(totals[0]).toBe(100);
            expect(totals[1]).toBe(200);
            expect(totals[2]).toBe(50);
            // 04:00 hour empty → zero-filled
            expect(totals[3]).toBe(0);
        });

        it("aggregates tokens/calls/sessions per model and zero-fills empty hours", () => {
            const start = new Date("2026-07-10T00:00:00Z").getTime();
            const end = new Date("2026-07-10T02:30:00Z").getTime();
            const buckets = [
                hb({
                    hour_start: new Date("2026-07-10T00:00:00Z").getTime(),
                    model: "claude-sonnet-4",
                    calls: 2,
                    sessions: 1,
                    tokens: 400,
                }),
                hb({
                    hour_start: new Date("2026-07-10T01:00:00Z").getTime(),
                    model: "opus",
                    calls: 1,
                    sessions: 1,
                    tokens: 60,
                }),
            ];
            // 3 buckets: 00:00, 01:00, 02:00 (partial)
            const data = prepareBarDataFromHourBuckets(buckets, "calls", start, end, "dark");
            expect(data.labels).toHaveLength(3);
            const totals = data.series.reduce<Record<number, number>>((acc, s) => {
                s.data.forEach((v, i) => {
                    acc[i] = (acc[i] ?? 0) + v;
                });
                return acc;
            }, {});
            expect(totals[0]).toBe(2);
            expect(totals[1]).toBe(1);
            // hour 02:00 has no bucket → 0
            expect(totals[2]).toBe(0);
            // series named by model
            expect(data.seriesNames).toContain("claude-sonnet-4");
            expect(data.seriesNames).toContain("opus");
            // per-model values land on the owning model's series, not another's
            expect(data.series.find((s) => s.name === "claude-sonnet-4")?.data[0]).toBe(2);
            expect(data.series.find((s) => s.name === "opus")?.data[1]).toBe(1);
        });

        it("drops buckets outside the window instead of overflowing the axis", () => {
            const start = new Date("2026-07-10T02:00:00Z").getTime();
            const end = new Date("2026-07-10T03:30:00Z").getTime();
            const buckets = [
                // before the window's first whole hour
                hb({ hour_start: new Date("2026-07-10T01:00:00Z").getTime(), tokens: 999 }),
                hb({ hour_start: new Date("2026-07-10T02:00:00Z").getTime(), tokens: 200 }),
                // after the window's last whole hour
                hb({ hour_start: new Date("2026-07-10T04:00:00Z").getTime(), tokens: 888 }),
            ];
            const data = prepareBarDataFromHourBuckets(buckets, "tokens", start, end, "dark");
            // axis: 02:00, 03:00 (start 02:00 is an exact hour; end 03:30 → partial 03:00)
            expect(data.labels).toHaveLength(2);
            const totals = data.series.reduce<Record<number, number>>((acc, s) => {
                s.data.forEach((v, i) => {
                    acc[i] = (acc[i] ?? 0) + v;
                });
                return acc;
            }, {});
            expect(totals[0]).toBe(200);
            expect(totals[1]).toBe(0);
            expect(totals[2]).toBeUndefined();
        });

        it("sessions metric uses per-hour distinct session counts", () => {
            const start = new Date("2026-07-10T00:00:00Z").getTime();
            const end = new Date("2026-07-10T01:30:00Z").getTime();
            const buckets = [
                hb({
                    hour_start: new Date("2026-07-10T00:00:00Z").getTime(),
                    sessions: 5,
                    calls: 9,
                    tokens: 0,
                }),
            ];
            const data = prepareBarDataFromHourBuckets(buckets, "sessions", start, end, "dark");
            const total = data.series.reduce((sum, s) => sum + (s.data[0] ?? 0), 0);
            expect(total).toBe(5);
        });
    });

    describe("prepareHeatmapData", () => {
        it("aggregates tokens by weekday and hour", () => {
            const d = new Date("2026-07-13T14:30:00").getTime(); // Monday
            const records = [record({ timestamp: d, input_tokens: 100 })];
            const { data, max } = prepareHeatmapData(records, "tokens");
            const point = data.find(([h, w]) => h === 14 && w === 0);
            if (!point) throw new Error("expected heatmap point");
            expect(point[2]).toBe(105);
            expect(max).toBe(105);
        });
    });

    describe("prepareHeatmapFromCells", () => {
        function cell(overrides: Partial<TokenStatsHeatmapCell> = {}): TokenStatsHeatmapCell {
            return {
                weekday: 1, // Monday (strftime %w 0=Sunday)
                hour: 9,
                calls: 3,
                sessions: 2,
                tokens: 500,
                ...overrides,
            };
        }

        it("maps cells into the Monday-first 7x24 grid", () => {
            const { data } = prepareHeatmapFromCells(
                [cell({ weekday: 1, hour: 9, tokens: 120 })],
                "tokens",
            );
            // weekday 1 (Monday) → grid index (1+6)%7 = 0
            const point = data.find(([h, w]) => h === 9 && w === 0);
            if (!point) throw new Error("expected Monday 09:00 point");
            expect(point[2]).toBe(120);
        });

        it("maps Sunday (weekday 0) to the last grid column", () => {
            const { data } = prepareHeatmapFromCells(
                [cell({ weekday: 0, hour: 12, calls: 7 })],
                "calls",
            );
            const point = data.find(([h, w]) => h === 12 && w === 6);
            if (!point) throw new Error("expected Sunday 12:00 point");
            expect(point[2]).toBe(7);
        });

        it("selects the metric column: sessions uses cell.sessions", () => {
            const { data } = prepareHeatmapFromCells(
                [cell({ weekday: 1, hour: 9, sessions: 4 })],
                "sessions",
            );
            const point = data.find(([h, w]) => h === 9 && w === 0);
            if (!point) throw new Error("expected point");
            expect(point[2]).toBe(4);
        });
    });

    // --- buckets/sessions-based aggregates (t164) ---
    // These mirror the records-based functions but consume the pre-aggregated
    // token_stats_buckets / token_stats_sessions rows so the renderer no longer
    // reduces hundreds of thousands of per-message records.

    function bucket(overrides: Partial<TokenStatsBucket> = {}): TokenStatsBucket {
        return {
            source: "claude_code",
            env: "win",
            bucket_date: "2026-07-10",
            model: "claude-sonnet-4",
            input_tokens: 0,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            sessions: 0,
            calls: 0,
            ...overrides,
        };
    }

    describe("agentSegmentsFromBuckets", () => {
        it("maps source to agent label and sums tokens, skipping zero agents", () => {
            const buckets = [
                bucket({ source: "claude_code", input_tokens: 100, output_tokens: 50 }),
                bucket({ source: "claude_code", input_tokens: 10 }),
                bucket({ source: "opencode", input_tokens: 30, output_tokens: 10 }),
                bucket({ source: "kimi_code", input_tokens: 5 }),
                bucket({ source: "grok", input_tokens: 70, output_tokens: 20 }),
            ];
            const segs = agentSegmentsFromBuckets(buckets);
            const byName = new Map(segs.map((s) => [s.name, s.value]));
            // tokens = input + output + cache_read + cache_write
            expect(byName.get("Claude Code")).toBe(160); // (100+50) + 10
            expect(byName.get("OpenCode")).toBe(40);
            expect(byName.get("Kimi Code")).toBe(5);
            expect(byName.get("Grok")).toBe(90);
            expect(segs).toHaveLength(4);
        });
    });

    describe("modelSegmentsFromBuckets", () => {
        it("groups buckets by model and returns top 5 + others", () => {
            const buckets = [
                bucket({ model: "a", input_tokens: 100 }),
                bucket({ model: "b", input_tokens: 80 }),
                bucket({ model: "c", input_tokens: 60 }),
                bucket({ model: "d", input_tokens: 40 }),
                bucket({ model: "e", input_tokens: 20 }),
                bucket({ model: "f", input_tokens: 10 }),
            ];
            const segs = modelSegmentsFromBuckets(buckets, "dark");
            const names = segs.map((s) => s.name);
            expect(names).toContain("a");
            expect(names.some((n) => n.startsWith("其他"))).toBe(true);
            const other = segs.find((s) => s.name.startsWith("其他"));
            expect(other?.value).toBe(10);
        });

        it("sums tokens across envs for the same model+date", () => {
            const buckets = [
                bucket({ model: "a", env: "win", input_tokens: 100 }),
                bucket({ model: "a", env: "wsl", input_tokens: 50 }),
            ];
            const segs = modelSegmentsFromBuckets(buckets, "dark");
            const a = segs.find((s) => s.name === "a");
            expect(a?.value).toBe(150);
        });
    });

    describe("compositionSegmentsFromBuckets", () => {
        it("sums each token component across all buckets", () => {
            const buckets = [
                bucket({
                    input_tokens: 100,
                    output_tokens: 50,
                    cache_read_tokens: 30,
                    cache_write_tokens: 20,
                }),
                bucket({
                    input_tokens: 10,
                    output_tokens: 5,
                    cache_read_tokens: 3,
                    cache_write_tokens: 2,
                }),
            ];
            const segs = compositionSegmentsFromBuckets(buckets);
            const byName = new Map(segs.map((s) => [s.name, s.value]));
            expect(byName.get("input")).toBe(110);
            expect(byName.get("output")).toBe(55);
            expect(byName.get("cache_read")).toBe(33);
            expect(byName.get("cache_write")).toBe(22);
        });
    });

    describe("kpiFromBuckets", () => {
        it("returns total tokens, sessions, calls summed across buckets", () => {
            const buckets = [
                bucket({
                    input_tokens: 100,
                    output_tokens: 50,
                    cache_read_tokens: 10,
                    cache_write_tokens: 5,
                    sessions: 3,
                    calls: 7,
                }),
                bucket({
                    input_tokens: 20,
                    output_tokens: 10,
                    sessions: 2,
                    calls: 4,
                }),
            ];
            const kpi = kpiFromBuckets(buckets);
            // tokens = input+output+cache_read+cache_write per row, summed
            expect(kpi.tokens).toBe(100 + 50 + 10 + 5 + 20 + 10);
            expect(kpi.sessions).toBe(5);
            expect(kpi.calls).toBe(11);
        });

        it("returns zeros for empty buckets", () => {
            const kpi = kpiFromBuckets([]);
            expect(kpi.tokens).toBe(0);
            expect(kpi.sessions).toBe(0);
            expect(kpi.calls).toBe(0);
        });
    });

    function session_row(overrides: Partial<TokenStatsSession> = {}): TokenStatsSession {
        return {
            id: "s1",
            source: "claude_code",
            env: "win",
            model: "claude-sonnet-4",
            title: null,
            directory: "/p/x",
            input_tokens: 0,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            calls: 0,
            started_at: 1000,
            ended_at: 2000,
            ...overrides,
        };
    }

    describe("projectSegmentsFromSessions", () => {
        it("counts distinct session ids per directory, top 5 + others", () => {
            const sessions = [
                session_row({ id: "a", directory: "/p/1" }),
                session_row({ id: "b", directory: "/p/1" }),
                session_row({ id: "c", directory: "/p/2" }),
                session_row({ id: "d", directory: "/p/3" }),
                session_row({ id: "e", directory: "/p/4" }),
                session_row({ id: "f", directory: "/p/5" }),
                session_row({ id: "g", directory: "/p/6" }),
            ];
            const segs = projectSegmentsFromSessions(sessions, "dark");
            // /p/1 has 2 sessions (top), others 1 each; top5 dirs + 其他
            // shortDir("/p/1") = "1"
            const one = segs.find((s) => s.name === "1");
            expect(one).toBeDefined();
            expect(one?.value).toBe(2);
            expect(segs.some((s) => s.name.startsWith("其他"))).toBe(true);
        });

        it("treats null directory as unknown", () => {
            const sessions = [session_row({ id: "a", directory: null })];
            const segs = projectSegmentsFromSessions(sessions, "dark");
            expect(segs).toHaveLength(1);
        });
    });

    describe("rollup aggregates (t184)", () => {
        function rollup_row(overrides: Partial<TokenStatsRollupRow> = {}): TokenStatsRollupRow {
            return {
                source: "claude_code",
                model: "claude-sonnet-4",
                directory: "/proj",
                session_id: "s1",
                title: "T1",
                calls: 1,
                input_tokens: 10,
                output_tokens: 5,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                ...overrides,
            };
        }

        describe("kpiFromRollup", () => {
            it("sums tokens/calls and counts distinct sessions across rows", () => {
                // Same session across two models → 1 distinct session, both calls
                // and token components summed.
                const rows = [
                    rollup_row({
                        session_id: "s1",
                        calls: 2,
                        input_tokens: 100,
                        output_tokens: 50,
                    }),
                    rollup_row({ session_id: "s1", calls: 3, input_tokens: 40, output_tokens: 20 }),
                    rollup_row({ session_id: "s2", calls: 1, input_tokens: 10, output_tokens: 5 }),
                ];
                const kpi = kpiFromRollup(rows);
                expect(kpi.tokens).toBe(225);
                expect(kpi.sessions).toBe(2);
                expect(kpi.calls).toBe(6);
            });

            it("is empty-safe", () => {
                expect(kpiFromRollup([])).toEqual({ tokens: 0, sessions: 0, calls: 0 });
            });
        });

        it("agentSegmentsFromRollup maps source to agent label and sums tokens", () => {
            const rows = [
                rollup_row({ source: "claude_code", input_tokens: 100 }),
                rollup_row({ source: "opencode", input_tokens: 50 }),
                rollup_row({ source: "claude_code", input_tokens: 25 }),
                rollup_row({ source: "grok", input_tokens: 40, output_tokens: 20 }),
            ];
            const segs = agentSegmentsFromRollup(rows);
            const claude = segs.find((s) => s.name === "Claude Code");
            const open = segs.find((s) => s.name === "OpenCode");
            const grok = segs.find((s) => s.name === "Grok");
            // each row also carries the default output_tokens (5).
            expect(claude?.value).toBe(135);
            expect(open?.value).toBe(55);
            expect(grok?.value).toBe(60);
            expect(segs.some((s) => s.name === "Kimi Code")).toBe(false);
        });

        it("compositionSegmentsFromRollup sums each token component", () => {
            const rows = [
                rollup_row({ input_tokens: 10, cache_read_tokens: 30 }),
                rollup_row({ output_tokens: 5, cache_write_tokens: 2 }),
            ];
            const segs = compositionSegmentsFromRollup(rows);
            // row1 contributes default output 5; row2 contributes default input 10.
            expect(segs.find((s) => s.name === "input")?.value).toBe(20);
            expect(segs.find((s) => s.name === "cache_read")?.value).toBe(30);
            expect(segs.find((s) => s.name === "output")?.value).toBe(10);
            expect(segs.find((s) => s.name === "cache_write")?.value).toBe(2);
        });

        it("modelSegmentsFromRollup groups by model, valFn selects tokens or calls", () => {
            const rows = [
                rollup_row({ model: "m1", calls: 4, input_tokens: 100 }),
                rollup_row({ model: "m1", calls: 2, input_tokens: 50 }),
                rollup_row({ model: "m2", calls: 1, input_tokens: 10 }),
            ];
            const tokens = modelSegmentsFromRollup(rows, sumTokensRollup, "dark");
            // token total includes the default output_tokens (5) per row.
            expect(tokens.find((s) => s.name === "m1")?.value).toBe(160);
            const calls = modelSegmentsFromRollup(rows, rollupCallValue, "dark");
            expect(calls.find((s) => s.name === "m1")?.value).toBe(6);
        });

        it("hitRateOfRollup computes cache_read / (cache_read + input)", () => {
            const rows = [
                rollup_row({ input_tokens: 10, cache_read_tokens: 30 }),
                rollup_row({ input_tokens: 20, cache_read_tokens: 10 }),
            ];
            expect(hitRateOfRollup(rows)).toBeCloseTo(40 / 70);
            expect(hitRateOfRollup([])).toBe(0);
        });

        describe("prepareBarDataFromRollup", () => {
            it("stacks the project axis by directory with alias grouping", () => {
                // sessions metric → project colorDim → series keys are resolved
                // directories, so the alias collapses both dirs into one column.
                const rows = [
                    rollup_row({ session_id: "a", directory: "/p1", input_tokens: 100 }),
                    rollup_row({ session_id: "b", directory: "/p1", input_tokens: 60 }),
                    rollup_row({ session_id: "c", directory: "/p2", input_tokens: 30 }),
                ];
                const data = prepareBarDataFromRollup(rows, "sessions", "project", "dark", [
                    { alias: "P", dirs: ["/p1", "/p2"] },
                ]);
                // Both dirs collapse under the alias → single "P" bar.
                expect(data.labels).toEqual(["P"]);
                // 3 distinct sessions across the two collapsed dirs.
                expect(data.series.find((s) => s.name === "P")?.data[0]).toBe(3);
            });

            it("keeps top 5 projects and merges the rest into 其他", () => {
                // sessions metric → project colorDim → series keys are dirs.
                const rows = Array.from({ length: 8 }, (_, i) =>
                    rollup_row({
                        session_id: `s${String(i)}`,
                        directory: `/p${String(i)}`,
                        input_tokens: 100 - i,
                    }),
                );
                const data = prepareBarDataFromRollup(rows, "sessions", "project", "dark");
                expect(data.seriesNames).toHaveLength(6);
                expect(data.seriesNames[5]).toBe("其他");
            });

            it("session axis ranks sessions by tokens and merges multi-model rows", () => {
                // One session uses two models → two rollup rows; must rank as one
                // session by combined tokens.
                const rows = [
                    rollup_row({ session_id: "big", title: "BigSession", input_tokens: 100 }),
                    rollup_row({
                        session_id: "big",
                        title: "BigSession",
                        model: "claude-opus-4",
                        input_tokens: 50,
                    }),
                    rollup_row({ session_id: "small", title: "Small", input_tokens: 10 }),
                ];
                const data = prepareBarDataFromRollup(rows, "tokens", "session", "dark");
                expect(data.labels[0]).toBe("BigSess…");
                expect(data.labels).toHaveLength(2);
            });

            it("calls metric counts aggregated calls per project", () => {
                const rows = [
                    rollup_row({ session_id: "a", directory: "/p1", calls: 5 }),
                    rollup_row({ session_id: "b", directory: "/p1", calls: 3 }),
                ];
                const data = prepareBarDataFromRollup(rows, "calls", "project", "dark");
                // shortDir("/p1") = "p1" labels the axis; the series stack sums
                // the raw dir key's aggregated calls across rows.
                const p1_idx = data.labels.indexOf("p1");
                expect(p1_idx).toBeGreaterThanOrEqual(0);
                const total = data.series.reduce((sum, s) => sum + (s.data[p1_idx] ?? 0), 0);
                expect(total).toBe(8);
            });
        });
    });

    describe("prepareBarDataFromDashboardChartData", () => {
        const start = new Date("2026-07-10T00:00:00").getTime();
        const chart_data: TokenStatsDashboardChartData = {
            axis: { labels: ["7/10", "7/11"], bucket_starts: [start, start + 24 * 3600000] },
            metric_buckets: [
                { hour_start: start, model: "sonnet", calls: 3, tokens: 30 },
                { hour_start: start, model: "opus", calls: 1, tokens: 10 },
                { hour_start: start + 24 * 3600000, model: "sonnet", calls: 2, tokens: 20 },
            ],
            session_buckets: [
                { hour_start: start, directory: "/alpha", sessions: 2 },
                { hour_start: start + 24 * 3600000, directory: "/beta", sessions: 1 },
            ],
            rollup: [
                {
                    source: "claude_code",
                    model: "sonnet",
                    directory: "/alpha",
                    session_id: "s1",
                    title: "Session one",
                    calls: 3,
                    input_tokens: 30,
                    output_tokens: 0,
                    cache_read_tokens: 0,
                    cache_write_tokens: 0,
                },
                {
                    source: "claude_code",
                    model: "opus",
                    directory: "/beta",
                    session_id: "s2",
                    title: "Session two",
                    calls: 1,
                    input_tokens: 10,
                    output_tokens: 0,
                    cache_read_tokens: 0,
                    cache_write_tokens: 0,
                },
            ],
        };

        it("derives the tokens time chart from metric buckets on the server axis", () => {
            const data = prepareBarDataFromDashboardChartData(chart_data, "tokens", "time", "dark");
            expect(data.labels).toEqual(["7/10", "7/11"]);
            expect(data.bucketStarts).toEqual([start, start + 24 * 3600000]);
            const sonnet = data.series.find((s) => s.name === "sonnet");
            expect(sonnet?.data).toEqual([30, 20]);
            const opus = data.series.find((s) => s.name === "opus");
            expect(opus?.data).toEqual([10, 0]);
        });

        it("derives the calls time chart from the same metric buckets", () => {
            const data = prepareBarDataFromDashboardChartData(chart_data, "calls", "time", "dark");
            const sonnet = data.series.find((s) => s.name === "sonnet");
            expect(sonnet?.data).toEqual([3, 2]);
        });

        it("derives the sessions time chart from per-directory distinct buckets", () => {
            const data = prepareBarDataFromDashboardChartData(
                chart_data,
                "sessions",
                "time",
                "dark",
            );
            const alpha = data.series.find((s) => s.name === "/alpha");
            expect(alpha?.data).toEqual([2, 0]);
            const beta = data.series.find((s) => s.name === "/beta");
            expect(beta?.data).toEqual([0, 1]);
        });

        it("derives the project axis from the bounded rollup rows", () => {
            const data = prepareBarDataFromDashboardChartData(
                chart_data,
                "tokens",
                "project",
                "dark",
            );
            const alpha_idx = data.labels.indexOf("/alpha");
            expect(alpha_idx).toBeGreaterThanOrEqual(0);
            const total = data.series.reduce((sum, s) => sum + (s.data[alpha_idx] ?? 0), 0);
            expect(total).toBe(30);
        });

        it("derives the session axis with raw titles", () => {
            const data = prepareBarDataFromDashboardChartData(
                chart_data,
                "tokens",
                "session",
                "dark",
            );
            expect(data.labels).toContain("Session one");
        });

        it("resolves dir aliases on the project axis", () => {
            const data = prepareBarDataFromDashboardChartData(
                chart_data,
                "tokens",
                "project",
                "dark",
                [{ alias: "P", dirs: ["/alpha", "/beta"] }],
            );
            expect(data.labels).toEqual(["P"]);
            const total = data.series.reduce((sum, s) => sum + (s.data[0] ?? 0), 0);
            expect(total).toBe(40);
        });

        it("resolves model aliases on the time axis", () => {
            const data = prepareBarDataFromDashboardChartData(
                chart_data,
                "tokens",
                "time",
                "dark",
                [],
                [{ alias: "S", models: ["sonnet", "opus"] }],
            );
            expect(data.series).toHaveLength(1);
            expect(data.series[0]?.name).toBe("S");
            expect(data.series[0]?.data).toEqual([40, 20]);
        });
    });

    describe("renderer 派生与改前服务器 chart 等价（oracle，t200 AC4）", () => {
        // 参考实现：diff_anchor 7303c4 的 token-stats-store.ts 的
        // dashboard_named_values / dashboard_chart_from_cells /
        // dashboard_chart_from_rollup 原样转写（只读基线，不随实现演进）。
        // oracle 与 renderer prepareBarDataFromDashboardRollup 在同一行集上
        // 比对，验证 AC4「展示结果与改前等价」。全部行 env 相同（f003 的 env
        // 差异由 p040 单独跟踪，不在本 oracle 暴露）。
        type OracleRow = TokenStatsRollupRow & { env: string };
        const oracle_alias_resolver = (
            aliases: { alias: string; keys: string[] }[] | undefined,
        ): ((key: string) => string) => {
            const lookup = new Map<string, string>();
            for (const item of aliases ?? []) {
                for (const key of item.keys) lookup.set(key, item.alias);
            }
            return (key) => lookup.get(key) ?? key;
        };
        const oracle_named_values = (totals: Map<string, number>) => {
            const ranked = [...totals.entries()]
                .filter(([, value]) => value > 0)
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
            const values = ranked.slice(0, 5).map(([key, value]) => ({ key, value }));
            const other_value = ranked.slice(5).reduce((sum, [, value]) => sum + value, 0);
            if (other_value > 0) values.push({ key: "其他", value: other_value });
            return values;
        };
        const oracle_chart_from_cells = (
            labels: string[],
            cells: Map<string, number>[],
        ): {
            labels: string[];
            series: { name: string; data: number[] }[];
            other_details: [string, number][][];
        } => {
            const totals = new Map<string, number>();
            for (const cell of cells) {
                for (const [key, value] of cell) totals.set(key, (totals.get(key) ?? 0) + value);
            }
            const top_keys = oracle_named_values(totals)
                .slice(0, 5)
                .map(({ key }) => key);
            const top_set = new Set(top_keys);
            const series_names = totals.size > top_keys.length ? [...top_keys, "其他"] : top_keys;
            const other_details = cells.map((cell) =>
                [...cell.entries()]
                    .filter(([key]) => !top_set.has(key))
                    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                    .slice(0, 20),
            );
            const series = series_names.map((name) => ({
                name,
                data: cells.map((cell) =>
                    [...cell.entries()].reduce(
                        (sum, [key, value]) =>
                            sum +
                            ((name === "其他" ? !top_set.has(key) : key === name) ? value : 0),
                        0,
                    ),
                ),
            }));
            return { labels, series, other_details };
        };
        const oracle_chart_from_rollup = (
            rows: OracleRow[],
            query: {
                metric: Metric;
                xaxis: "project" | "session";
                dir_aliases?: { alias: string; keys: string[] }[];
                model_aliases?: { alias: string; keys: string[] }[];
            },
        ) => {
            const value_of = (row: OracleRow): number =>
                query.metric === "tokens"
                    ? row.input_tokens +
                      row.output_tokens +
                      row.cache_read_tokens +
                      row.cache_write_tokens
                    : query.metric === "calls"
                      ? row.calls
                      : 1;
            const directory_resolver = oracle_alias_resolver(query.dir_aliases);
            const model_resolver = oracle_alias_resolver(query.model_aliases);
            const session_key = (row: OracleRow): string =>
                `${row.source}|${row.env}|${row.session_id}`;
            const category_of = (row: OracleRow): string =>
                query.xaxis === "project"
                    ? directory_resolver(row.directory ?? "(unknown)")
                    : session_key(row);
            const category_totals = new Map<string, number>();
            const category_sessions = new Map<string, Set<string>>();
            for (const row of rows) {
                const category = category_of(row);
                if (query.metric === "sessions") {
                    const sessions = category_sessions.get(category) ?? new Set<string>();
                    sessions.add(session_key(row));
                    category_sessions.set(category, sessions);
                } else {
                    category_totals.set(
                        category,
                        (category_totals.get(category) ?? 0) + value_of(row),
                    );
                }
            }
            if (query.metric === "sessions") {
                for (const [category, sessions] of category_sessions) {
                    category_totals.set(category, sessions.size);
                }
            }
            const ranked_categories = [...category_totals.entries()]
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                .slice(0, 20)
                .map(([category]) => category);
            const category_set = new Set(ranked_categories);
            const labels = ranked_categories.map((category) =>
                query.xaxis === "session"
                    ? (rows.find((row) => category_of(row) === category)?.title ?? "")
                    : category,
            );
            const cells = ranked_categories.map(() => new Map<string, number>());
            const session_cells = ranked_categories.map(() => new Map<string, Set<string>>());
            const other_index = ranked_categories.length < category_totals.size ? cells.length : -1;
            if (other_index >= 0) {
                labels.push("其他");
                cells.push(new Map());
                session_cells.push(new Map());
            }
            for (const row of rows) {
                const raw_category = category_of(row);
                const index = category_set.has(raw_category)
                    ? ranked_categories.indexOf(raw_category)
                    : other_index;
                if (index < 0) continue;
                const cell = cells[index];
                if (!cell) continue;
                const key =
                    query.metric === "sessions"
                        ? directory_resolver(row.directory ?? "(unknown)")
                        : model_resolver(row.model);
                if (query.metric === "sessions") {
                    const session_cell = session_cells[index];
                    if (!session_cell) continue;
                    const sessions = session_cell.get(key) ?? new Set<string>();
                    sessions.add(session_key(row));
                    session_cell.set(key, sessions);
                } else {
                    cell.set(key, (cell.get(key) ?? 0) + value_of(row));
                }
            }
            if (query.metric === "sessions") {
                session_cells.forEach((session_cell, index) => {
                    const cell = cells[index];
                    if (!cell) return;
                    for (const [key, sessions] of session_cell) cell.set(key, sessions.size);
                });
            }
            return oracle_chart_from_cells(labels, cells);
        };

        const oracle_rows: OracleRow[] = [
            {
                source: "claude_code",
                env: "win",
                model: "m1",
                directory: "/alpha",
                session_id: "s1",
                title: "One",
                calls: 4,
                input_tokens: 100,
                output_tokens: 50,
                cache_read_tokens: 10,
                cache_write_tokens: 5,
            },
            {
                source: "claude_code",
                env: "win",
                model: "m2",
                directory: "/alpha",
                session_id: "s1",
                title: "One",
                calls: 2,
                input_tokens: 40,
                output_tokens: 20,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
            },
            {
                source: "claude_code",
                env: "win",
                model: "m1",
                directory: "/beta",
                session_id: "s2",
                title: "Two",
                calls: 1,
                input_tokens: 10,
                output_tokens: 5,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
            },
            {
                source: "claude_code",
                env: "win",
                model: "m3",
                directory: "/gamma",
                session_id: "s3",
                title: "Three",
                calls: 3,
                input_tokens: 60,
                output_tokens: 30,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
            },
            {
                source: "claude_code",
                env: "win",
                model: "m4",
                directory: "/delta",
                session_id: "s4",
                title: "Four",
                calls: 1,
                input_tokens: 20,
                output_tokens: 10,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
            },
            {
                source: "claude_code",
                env: "win",
                model: "m5",
                directory: "/epsilon",
                session_id: "s5",
                title: "Five",
                calls: 1,
                input_tokens: 5,
                output_tokens: 2,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
            },
            {
                source: "claude_code",
                env: "win",
                model: "m6",
                directory: "/zeta",
                session_id: "s6",
                title: "Six",
                calls: 1,
                input_tokens: 3,
                output_tokens: 1,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
            },
        ];
        const dir_alias_renderer = [{ alias: "A", dirs: ["/alpha", "/beta"] }];
        const dir_alias_oracle = [{ alias: "A", keys: ["/alpha", "/beta"] }];
        const model_alias_renderer = [{ alias: "X", models: ["m1", "m3"] }];
        const model_alias_oracle = [{ alias: "X", keys: ["m1", "m3"] }];

        const expect_oracle_equivalence = (metric: Metric, xaxis: "project" | "session"): void => {
            const renderer = prepareBarDataFromDashboardRollup(
                oracle_rows,
                metric,
                xaxis,
                "dark",
                dir_alias_renderer,
                model_alias_renderer,
            );
            const oracle = oracle_chart_from_rollup(oracle_rows, {
                metric,
                xaxis,
                dir_aliases: dir_alias_oracle,
                model_aliases: model_alias_oracle,
            });
            expect(renderer.labels).toEqual(oracle.labels);
            expect(renderer.series.map((s) => s.name).sort()).toEqual(
                oracle.series.map((s) => s.name).sort(),
            );
            for (const s of renderer.series) {
                const o = oracle.series.find((entry) => entry.name === s.name);
                expect(o).toBeTruthy();
                expect(s.data).toEqual(o?.data);
            }
            expect(renderer.otherDetails).toEqual(oracle.other_details);
        };

        it("tokens × project 与改前等价", () => {
            expect_oracle_equivalence("tokens", "project");
        });
        it("calls × project 与改前等价", () => {
            expect_oracle_equivalence("calls", "project");
        });
        it("sessions × project 与改前等价", () => {
            expect_oracle_equivalence("sessions", "project");
        });
        it("tokens × session 与改前等价", () => {
            expect_oracle_equivalence("tokens", "session");
        });
        it("calls × session 与改前等价", () => {
            expect_oracle_equivalence("calls", "session");
        });
        it("sessions × session 与改前等价", () => {
            expect_oracle_equivalence("sessions", "session");
        });

        it("Top5 边界并列值按名称 tie-break 与改前等价（f005）", () => {
            // 6 个 model：m1..m4 合计 100/80/60/40，m5 与 m6 并列 30——
            // 第 5/6 名恰落在 Top5 边界，topGroups 的 tie-break 决定谁进
            // 命名系列、谁归「其他」。目录名让 m6 的 cell 排在 m5 之前
            // （/a6 名称序先于 /z5），故无名称 tie-break 时稳定排序会按
            // cell 插入序把 m6 选进 Top5——与改前服务器 name 序相悖，
            // 此用例钉住 aggregate.ts 的 tie-break。
            const tie_row = (
                model: string,
                directory: string,
                session_id: string,
                input_tokens: number,
            ): OracleRow => ({
                source: "claude_code",
                env: "win",
                model,
                directory,
                session_id,
                title: directory,
                calls: 1,
                input_tokens,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
            });
            const tie_rows: OracleRow[] = [
                tie_row("m1", "/p1", "s1", 100),
                tie_row("m2", "/p2", "s2", 80),
                tie_row("m3", "/p3", "s3", 60),
                tie_row("m4", "/p4", "s4", 40),
                tie_row("m6", "/a6", "s6", 30),
                tie_row("m5", "/z5", "s5", 30),
            ];
            const renderer = prepareBarDataFromDashboardRollup(
                tie_rows,
                "tokens",
                "project",
                "dark",
            );
            const oracle = oracle_chart_from_rollup(tie_rows, {
                metric: "tokens",
                xaxis: "project",
            });
            expect(renderer.labels).toEqual(oracle.labels);
            // 顺序敏感：不 sort，直接比对系列名序——tie-break 只影响序与
            // 5/6 入选，sort 会掩蔽差异（f005）。
            expect(renderer.series.map((s) => s.name)).toEqual(oracle.series.map((s) => s.name));
            // 并列的 m5/m6 中，名称靠前的 m5 进命名系列、m6 归「其他」。
            expect(renderer.series.some((s) => s.name === "m5")).toBe(true);
            expect(renderer.series.some((s) => s.name === "m6")).toBe(false);
            for (const s of renderer.series) {
                const o = oracle.series.find((entry) => entry.name === s.name);
                expect(o).toBeTruthy();
                expect(s.data).toEqual(o?.data);
            }
        });
    });
});
