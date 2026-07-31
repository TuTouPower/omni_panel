import { describe, it, expect } from "vitest";
import type {
    AgentSessionUsage,
    TokenStatsBucket,
    TokenStatsHeatmapCell,
    TokenStatsSession,
} from "../../../../../src/shared/types/token-stats";
import {
    agentSegments,
    agentSegmentsFromBuckets,
    compositionSegments,
    compositionSegmentsFromBuckets,
    escapeHtml,
    kpiFromBuckets,
    modelColorMap,
    modelSegments,
    modelSegmentsFromBuckets,
    prepareBarData,
    prepareBarDataFromBuckets,
    prepareHeatmapData,
    prepareHeatmapFromCells,
    projectSegments,
    projectSegmentsFromSessions,
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
        ];
        const segs = agentSegments(records);
        const byName = new Map(segs.map((s) => [s.name, s.value]));
        // claude-code: (100+50) + (10+5 default out) = 165; cache excluded
        expect(byName.get("Claude Code")).toBe(165);
        expect(byName.get("OpenCode")).toBe(40);
        expect(byName.get("Kimi Code")).toBe(10);
        expect(segs).toHaveLength(3);
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
            ];
            const segs = agentSegmentsFromBuckets(buckets);
            const byName = new Map(segs.map((s) => [s.name, s.value]));
            // tokens = input + output + cache_read + cache_write
            expect(byName.get("Claude Code")).toBe(160); // (100+50) + 10
            expect(byName.get("OpenCode")).toBe(40);
            expect(byName.get("Kimi Code")).toBe(5);
            expect(segs).toHaveLength(3);
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
});
