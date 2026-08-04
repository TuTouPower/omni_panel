import { describe, it, expect } from "vitest";
import {
    bucketize,
    groupBy,
    hitRateOf,
    metricValue,
    prevRangeRecords,
    sessionRows,
    sumTokens,
    topGroups,
} from "../../../../../src/renderer/lib/token-stats/aggregate";
import type { AgentSessionUsage } from "../../../../../src/shared/types/token-stats";

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

describe("aggregate", () => {
    describe("sumTokens", () => {
        it("sums all token kinds", () => {
            expect(
                sumTokens({
                    input_tokens: 1,
                    output_tokens: 2,
                    cache_read_tokens: 3,
                    cache_write_tokens: 4,
                } as AgentSessionUsage),
            ).toBe(10);
        });
    });

    describe("metricValue", () => {
        it("sums tokens", () => {
            expect(
                metricValue(
                    [record({ input_tokens: 100 }), record({ output_tokens: 50 })],
                    "tokens",
                ),
            ).toBe(165);
        });

        it("counts unique sessions", () => {
            expect(
                metricValue(
                    [
                        record({ session_id: "a" }),
                        record({ session_id: "a" }),
                        record({ session_id: "b" }),
                    ],
                    "sessions",
                ),
            ).toBe(2);
        });

        it("counts records as calls", () => {
            expect(metricValue([record(), record(), record()], "calls")).toBe(3);
        });
    });

    describe("groupBy", () => {
        it("groups by key function", () => {
            const records = [
                record({ model: "a" }),
                record({ model: "b" }),
                record({ model: "a" }),
            ];
            const grouped = groupBy(records, (r) => r.model);
            expect(Object.keys(grouped).sort()).toEqual(["a", "b"]);
            expect(grouped["a"]).toHaveLength(2);
            expect(grouped["b"]).toHaveLength(1);
        });
    });

    describe("topGroups", () => {
        it("returns top N and the rest", () => {
            const totals = { a: 100, b: 80, c: 60, d: 40, e: 20, f: 10 };
            const { top, rest } = topGroups(totals, 3);
            expect(top).toEqual(["a", "b", "c"]);
            expect(rest.sort()).toEqual(["d", "e", "f"]);
        });

        it("excludes zero totals", () => {
            const totals = { a: 100, b: 0, c: 50 };
            const { top, rest } = topGroups(totals, 5);
            expect(top).toEqual(["a", "c"]);
            expect(rest).toEqual([]);
        });

        it("breaks value ties by name order, not insertion order (t200 f005)", () => {
            // z 插入在前、值与 a 并列；tie-break 必须按名称升序选出 a，
            // 否则 Object.entries 插入序会让 z 顶掉 a 进 top。
            const totals = { x: 100, z: 50, a: 50 };
            const { top, rest } = topGroups(totals, 2);
            expect(top).toEqual(["x", "a"]);
            expect(rest).toEqual(["z"]);
        });
    });

    describe("hitRateOf", () => {
        it("computes cache_read / (cache_read + input)", () => {
            const records = [
                record({ input_tokens: 100, cache_read_tokens: 50 }),
                record({ input_tokens: 100, cache_read_tokens: 150 }),
            ];
            expect(hitRateOf(records)).toBeCloseTo(0.5);
        });

        it("returns 0 when denominator is 0", () => {
            expect(hitRateOf([record({ input_tokens: 0, cache_read_tokens: 0 })])).toBe(0);
        });
    });

    describe("bucketize", () => {
        it("splits a non-midnight seven-day window into natural day buckets", () => {
            const start = new Date("2026-07-17T15:30:00").getTime();
            const end = new Date("2026-07-24T15:30:00").getTime();
            const bk = bucketize(start, end, "day");

            expect(bk.n).toBe(8);
            expect(Array.from({ length: bk.n }, (_, i) => bk.label(i))).toEqual([
                "7/17",
                "7/18",
                "7/19",
                "7/20",
                "7/21",
                "7/22",
                "7/23",
                "7/24",
            ]);
            expect(bk.startOf(0)).toBe(start);
            expect(bk.startOf(1)).toBe(new Date("2026-07-18T00:00:00").getTime());
            expect(bk.startOf(7)).toBe(new Date("2026-07-24T00:00:00").getTime());
            expect(bk.idx(new Date("2026-07-17T15:35:00").getTime())).toBe(0);
            expect(bk.idx(new Date("2026-07-18T00:00:00").getTime())).toBe(1);
            expect(bk.idx(new Date("2026-07-24T10:00:00").getTime())).toBe(7);
        });

        it("splits a non-hour-aligned 24-hour window into natural hour buckets", () => {
            const start = new Date("2026-07-23T15:30:00").getTime();
            const end = new Date("2026-07-24T15:30:00").getTime();
            const bk = bucketize(start, end, "hour");

            expect(bk.n).toBe(25);
            expect(bk.label(0)).toBe("7/23 15:00");
            expect(bk.label(1)).toBe("7/23 16:00");
            expect(bk.label(24)).toBe("7/24 15:00");
            expect(bk.startOf(1)).toBe(new Date("2026-07-23T16:00:00").getTime());
            expect(bk.idx(new Date("2026-07-23T15:45:00").getTime())).toBe(0);
            expect(bk.idx(new Date("2026-07-24T14:30:00").getTime())).toBe(23);
            expect(bk.idx(new Date("2026-07-24T15:10:00").getTime())).toBe(24);
        });

        it("creates thirty-one natural day buckets for a non-midnight thirty-day window", () => {
            const start = new Date("2026-06-24T15:30:00").getTime();
            const end = new Date("2026-07-24T15:30:00").getTime();
            const bk = bucketize(start, end, "day");

            expect(bk.n).toBe(31);
            expect(bk.label(0)).toBe("6/24");
            expect(bk.label(30)).toBe("7/24");
        });

        it("does not create extra buckets when the range is already aligned", () => {
            const day_start = new Date("2026-07-10T00:00:00").getTime();
            const day_end = new Date("2026-07-13T00:00:00").getTime();
            const day_buckets = bucketize(day_start, day_end, "day");
            const hour_end = new Date("2026-07-10T03:00:00").getTime();
            const hour_buckets = bucketize(day_start, hour_end, "hour");

            expect(day_buckets.n).toBe(3);
            expect(day_buckets.label(0)).toBe("7/10");
            expect(day_buckets.label(2)).toBe("7/12");
            expect(hour_buckets.n).toBe(3);
            expect(hour_buckets.label(0)).toBe("7/10 00:00");
            expect(hour_buckets.label(2)).toBe("7/10 02:00");
        });

        it("maps boundary timestamps into the next bucket and clamps range endpoints", () => {
            const start = new Date("2026-07-17T15:30:00").getTime();
            const end = new Date("2026-07-24T15:30:00").getTime();
            const bk = bucketize(start, end, "day");
            const first_boundary = new Date("2026-07-18T00:00:00").getTime();

            expect(bk.idx(start)).toBe(0);
            expect(bk.idx(first_boundary - 1)).toBe(0);
            expect(bk.idx(first_boundary)).toBe(1);
            expect(bk.idx(end)).toBe(bk.n - 1);
            expect(bk.idx(start - 1)).toBe(0);
            expect(bk.idx(end + 1)).toBe(bk.n - 1);
        });
    });

    describe("sessionRows", () => {
        it("aggregates records into session rows", () => {
            const records = [
                record({ session_id: "a", input_tokens: 100, output_tokens: 50, timestamp: 1000 }),
                record({ session_id: "a", model: "other", input_tokens: 30, timestamp: 2000 }),
                record({ session_id: "b", input_tokens: 10, timestamp: 500 }),
            ];
            const rows = sessionRows(records);
            expect(rows).toHaveLength(2);
            const a = rows.find((r) => r.session_id === "a");
            if (!a) throw new Error("expected session a");
            expect(a.calls).toBe(2);
            expect(a.tokens).toBe(185);
            expect(a.models).toContain("claude-sonnet-4");
            expect(a.models).toContain("other");
            expect(a.lastTs).toBe(2000);
        });
    });

    describe("prevRangeRecords", () => {
        it("returns records in the previous equal-length window", () => {
            const records = [
                record({ timestamp: 500 }),
                record({ timestamp: 1500 }),
                record({ timestamp: 2500 }),
                record({ timestamp: 3500 }),
            ];
            const current = { start: 2000, end: 4000 };
            const prev = prevRangeRecords(records, current);
            expect(prev.map((r) => r.timestamp)).toEqual([500, 1500]);
        });
    });
});
