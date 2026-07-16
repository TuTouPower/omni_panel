import { describe, it, expect } from "vitest";
import { aggregate_sessions } from "../../../../../src/main/core/token-stats/aggregator";
import type { TokenStatsSession } from "../../../../../src/shared/types/token-stats";

function session(overrides: Partial<TokenStatsSession> = {}): TokenStatsSession {
    return {
        id: "s1",
        source: "claude_code",
        env: "win",
        model: "claude-sonnet-4-20250514",
        title: null,
        directory: null,
        input_tokens: 100,
        output_tokens: 50,
        cache_read_tokens: 10,
        cache_write_tokens: 5,
        calls: 2,
        started_at: new Date("2026-07-10T08:00:00Z").getTime(),
        ended_at: new Date("2026-07-10T09:00:00Z").getTime(),
        ...overrides,
    };
}

describe("aggregate_sessions", () => {
    it("returns empty buckets for empty input", () => {
        const result = aggregate_sessions([]);
        expect(result.buckets).toEqual([]);
        expect(result.sessions).toEqual([]);
    });

    it("passes sessions through unchanged", () => {
        const s = session();
        const result = aggregate_sessions([s]);
        expect(result.sessions).toEqual([s]);
    });

    it("aggregates single session into one bucket", () => {
        const s = session();
        const { buckets } = aggregate_sessions([s]);

        expect(buckets).toHaveLength(1);
        expect(buckets[0]).toEqual({
            source: "claude_code",
            env: "win",
            bucket_date: "2026-07-10",
            model: "claude-sonnet-4-20250514",
            input_tokens: 100,
            output_tokens: 50,
            cache_read_tokens: 10,
            cache_write_tokens: 5,
            sessions: 1,
            calls: 2,
        });
    });

    it("merges multiple sessions from same model/day into one bucket", () => {
        const s1 = session({ id: "s1", input_tokens: 100, output_tokens: 50, calls: 2 });
        const s2 = session({ id: "s2", input_tokens: 200, output_tokens: 80, calls: 3 });
        const { buckets } = aggregate_sessions([s1, s2]);

        expect(buckets).toHaveLength(1);
        expect(buckets[0].input_tokens).toBe(300);
        expect(buckets[0].output_tokens).toBe(130);
        expect(buckets[0].sessions).toBe(2);
        expect(buckets[0].calls).toBe(5);
    });

    it("separates buckets by source", () => {
        const claude = session({ source: "claude_code" });
        const open = session({ source: "opencode" });
        const { buckets } = aggregate_sessions([claude, open]);

        expect(buckets).toHaveLength(2);
        const sources = buckets.map((b) => b.source).sort();
        expect(sources).toEqual(["claude_code", "opencode"]);
    });

    it("separates buckets by env", () => {
        const win = session({ env: "win" });
        const wsl = session({ env: "wsl" });
        const { buckets } = aggregate_sessions([win, wsl]);

        expect(buckets).toHaveLength(2);
        const envs = buckets.map((b) => b.env).sort();
        expect(envs).toEqual(["win", "wsl"]);
    });

    it("separates buckets by date", () => {
        const day1 = session({
            started_at: new Date("2026-07-10T08:00:00Z").getTime(),
        });
        const day2 = session({
            started_at: new Date("2026-07-11T08:00:00Z").getTime(),
        });
        const { buckets } = aggregate_sessions([day1, day2]);

        expect(buckets).toHaveLength(2);
        const dates = buckets.map((b) => b.bucket_date).sort();
        expect(dates).toEqual(["2026-07-10", "2026-07-11"]);
    });

    it("calculates correct sums for all token fields", () => {
        const s1 = session({
            input_tokens: 100,
            output_tokens: 50,
            cache_read_tokens: 10,
            cache_write_tokens: 5,
            calls: 1,
        });
        const s2 = session({
            input_tokens: 200,
            output_tokens: 80,
            cache_read_tokens: 20,
            cache_write_tokens: 15,
            calls: 3,
        });
        const { buckets } = aggregate_sessions([s1, s2]);

        expect(buckets[0].input_tokens).toBe(300);
        expect(buckets[0].output_tokens).toBe(130);
        expect(buckets[0].cache_read_tokens).toBe(30);
        expect(buckets[0].cache_write_tokens).toBe(20);
        expect(buckets[0].calls).toBe(4);
    });
});
