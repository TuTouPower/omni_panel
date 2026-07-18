import { describe, it, expect } from "vitest";
import type { AgentSessionUsage } from "../../../../../src/shared/types/token-stats";
import {
    compositionSegments,
    modelSegments,
    prepareBarData,
    prepareHeatmapData,
    projectSegments,
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
            const other = segs[5];
            if (!other) throw new Error("expected other segment");
            expect(other.name).toContain("其他");
            expect(other.value).toBe(40);
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
            const segs = projectSegments(records);
            const byName = new Map(segs.map((s) => [s.name, s.value]));
            expect(byName.get("a")).toBe(2);
            expect(byName.get("b")).toBe(1);
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
});
