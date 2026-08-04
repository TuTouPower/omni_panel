import { describe, expect, it, vi } from "vitest";
import {
    create_token_stats_query_cache,
    type TokenStatsQueryKey,
} from "../../../../src/renderer/lib/token-stats/query-cache";

const key = (value: string, overrides: Partial<TokenStatsQueryKey> = {}): TokenStatsQueryKey => ({
    agent: "all",
    platform: "all",
    model: "all",
    range_start: 1,
    range_end: 2,
    query_mode: value,
    gran: "hour",
    ...overrides,
});

describe("token stats query cache", () => {
    it("returns cached data immediately and shares in-flight fetches", async () => {
        const cache = create_token_stats_query_cache({ max_entries: 2 });
        let resolve!: (value: string) => void;
        const fetcher = vi.fn(
            () =>
                new Promise<string>((resolver) => {
                    resolve = resolver;
                }),
        );

        const first = cache.load(key("tokens"), fetcher);
        const second = cache.load(key("tokens"), fetcher);
        expect(fetcher).toHaveBeenCalledTimes(1);

        resolve("first");
        await expect(first).resolves.toEqual({ data: "first", refreshed: true });
        await expect(second).resolves.toEqual({ data: "first", refreshed: true });

        await expect(cache.load(key("tokens"), fetcher)).resolves.toEqual({
            data: "first",
            refreshed: false,
        });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("marks entries stale without discarding data and refreshes once", async () => {
        const cache = create_token_stats_query_cache({ max_entries: 2 });
        const fetcher = vi.fn().mockResolvedValueOnce("old").mockResolvedValueOnce("new");

        await expect(cache.load(key("tokens"), fetcher)).resolves.toEqual({
            data: "old",
            refreshed: true,
        });
        expect(cache.peek(key("tokens"))).toEqual({ data: "old", stale: false });

        cache.mark_stale();
        expect(cache.peek(key("tokens"))).toEqual({ data: "old", stale: true });
        await expect(cache.load(key("tokens"), fetcher)).resolves.toEqual({
            data: "new",
            refreshed: true,
        });
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it("keeps every query key dimension isolated", async () => {
        const dimensions: Partial<TokenStatsQueryKey>[] = [
            { agent: "claude-code" },
            { platform: "win" },
            { model: "sonnet" },
            { range_start: 3 },
            { range_end: 4 },
            { query_mode: "dashboard" },
            { gran: "day" },
            { alias_fingerprint: "a1" },
        ];
        const cache = create_token_stats_query_cache<string>({ max_entries: 16 });
        const fetcher = vi.fn().mockResolvedValue("value");

        await cache.load(key("records"), fetcher);
        for (const overrides of dimensions) {
            await cache.load(key("records", overrides), fetcher);
        }

        expect(fetcher).toHaveBeenCalledTimes(dimensions.length + 1);
    });

    it("evicts the least recently used entry at the configured bound", async () => {
        const cache = create_token_stats_query_cache({ max_entries: 2 });
        const fetcher = vi.fn((value: string) => Promise.resolve(value));

        await cache.load(key("a"), () => fetcher("a"));
        await cache.load(key("b"), () => fetcher("b"));
        await cache.load(key("a"), () => fetcher("a-again"));
        await cache.load(key("c"), () => fetcher("c"));
        expect(cache.peek(key("b"))).toBeUndefined();
        expect(cache.peek(key("a"))?.data).toBe("a");
        expect(cache.peek(key("c"))?.data).toBe("c");
        expect(cache.size()).toBe(2);
    });
});
