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
        it("creates day buckets", () => {
            const start = new Date("2026-07-10T00:00:00").getTime();
            const end = new Date("2026-07-13T00:00:00").getTime();
            const bk = bucketize(start, end, "day");
            expect(bk.step).toBe(86400000);
            expect(bk.n).toBe(3);
            expect(bk.label(0)).toBe("7/10");
        });

        it("creates hour buckets", () => {
            const start = new Date("2026-07-10T00:00:00").getTime();
            const end = new Date("2026-07-10T03:00:00").getTime();
            const bk = bucketize(start, end, "hour");
            expect(bk.step).toBe(3600000);
            expect(bk.n).toBe(3);
            expect(bk.label(0)).toMatch(/^7\/10 00:00$/);
        });

        it("maps timestamps to bucket indices", () => {
            const start = new Date("2026-07-10T00:00:00").getTime();
            const end = new Date("2026-07-11T00:00:00").getTime();
            const bk = bucketize(start, end, "hour");
            expect(bk.idx(start)).toBe(0);
            expect(bk.idx(start + 3600000)).toBe(1);
            expect(bk.idx(end - 1)).toBe(23);
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
