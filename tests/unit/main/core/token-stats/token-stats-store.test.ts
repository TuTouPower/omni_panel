import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { create_token_stats_store } from "../../../../../src/main/core/token-stats/token-stats-store";
import type { TokenStatsStore } from "../../../../../src/main/core/token-stats/token-stats-store";
import type {
    TokenStatsBucket,
    TokenStatsSession,
} from "../../../../../src/shared/types/token-stats";

describe("token-stats-store", () => {
    let store: TokenStatsStore;

    beforeEach(() => {
        store = create_token_stats_store(":memory:");
    });

    afterEach(() => {
        store.close();
    });

    describe("buckets", () => {
        it("upserts and queries buckets", () => {
            const bucket: TokenStatsBucket = {
                source: "claude_code",
                env: "win",
                bucket_date: "2025-01-15",
                model: "claude-sonnet-4-20250514",
                input_tokens: 1000,
                output_tokens: 500,
                cache_read_tokens: 200,
                cache_write_tokens: 100,
                sessions: 5,
                calls: 10,
            };

            store.upsert_buckets([bucket]);
            const results = store.query_buckets({});

            expect(results).toHaveLength(1);
            expect(results[0]).toEqual(bucket);
        });

        it("replaces bucket on conflict (same source+env+bucket_date+model)", () => {
            const bucket: TokenStatsBucket = {
                source: "claude_code",
                env: "win",
                bucket_date: "2025-01-15",
                model: "claude-sonnet-4-20250514",
                input_tokens: 1000,
                output_tokens: 500,
                cache_read_tokens: 200,
                cache_write_tokens: 100,
                sessions: 5,
                calls: 10,
            };

            store.upsert_buckets([bucket]);

            const updated: TokenStatsBucket = {
                ...bucket,
                input_tokens: 2000,
                calls: 20,
            };

            store.upsert_buckets([updated]);
            const results = store.query_buckets({});

            expect(results).toHaveLength(1);
            expect(results[0].input_tokens).toBe(2000);
            expect(results[0].calls).toBe(20);
        });

        it("queries buckets with filters", () => {
            const buckets: TokenStatsBucket[] = [
                {
                    source: "claude_code",
                    env: "win",
                    bucket_date: "2025-01-15",
                    model: "claude-sonnet-4-20250514",
                    input_tokens: 1000,
                    output_tokens: 500,
                    cache_read_tokens: 200,
                    cache_write_tokens: 100,
                    sessions: 5,
                    calls: 10,
                },
                {
                    source: "opencode",
                    env: "wsl",
                    bucket_date: "2025-01-16",
                    model: "gpt-4",
                    input_tokens: 3000,
                    output_tokens: 1500,
                    cache_read_tokens: 600,
                    cache_write_tokens: 300,
                    sessions: 15,
                    calls: 30,
                },
                {
                    source: "claude_code",
                    env: "win",
                    bucket_date: "2025-01-17",
                    model: "claude-sonnet-4-20250514",
                    input_tokens: 5000,
                    output_tokens: 2500,
                    cache_read_tokens: 1000,
                    cache_write_tokens: 500,
                    sessions: 25,
                    calls: 50,
                },
            ];

            store.upsert_buckets(buckets);

            // Filter by source
            const claude_buckets = store.query_buckets({ source: "claude_code" });
            expect(claude_buckets).toHaveLength(2);

            // Filter by env
            const wsl_buckets = store.query_buckets({ env: "wsl" });
            expect(wsl_buckets).toHaveLength(1);

            // Filter by date range
            const date_buckets = store.query_buckets({
                from_date: "2025-01-16",
                to_date: "2025-01-17",
            });
            expect(date_buckets).toHaveLength(2);

            // Combined filters
            const combined = store.query_buckets({
                source: "claude_code",
                from_date: "2025-01-17",
            });
            expect(combined).toHaveLength(1);
            expect(combined[0].bucket_date).toBe("2025-01-17");
        });
    });

    describe("sessions", () => {
        it("upserts and queries sessions", () => {
            const session: TokenStatsSession = {
                id: "session-1",
                source: "claude_code",
                env: "win",
                model: "claude-sonnet-4-20250514",
                title: "Test session",
                directory: "/home/user/project",
                input_tokens: 1000,
                output_tokens: 500,
                cache_read_tokens: 200,
                cache_write_tokens: 100,
                calls: 10,
                started_at: 1700000000000,
                ended_at: 1700001000000,
            };

            store.upsert_sessions([session]);
            const results = store.query_sessions({});

            expect(results).toHaveLength(1);
            expect(results[0]).toEqual(session);
        });

        it("replaces session on conflict (same id+source+env)", () => {
            const session: TokenStatsSession = {
                id: "session-1",
                source: "claude_code",
                env: "win",
                model: "claude-sonnet-4-20250514",
                title: "Test session",
                directory: "/home/user/project",
                input_tokens: 1000,
                output_tokens: 500,
                cache_read_tokens: 200,
                cache_write_tokens: 100,
                calls: 10,
                started_at: 1700000000000,
                ended_at: 1700001000000,
            };

            store.upsert_sessions([session]);

            const updated: TokenStatsSession = {
                ...session,
                input_tokens: 2000,
                calls: 20,
                ended_at: 1700002000000,
            };

            store.upsert_sessions([updated]);
            const results = store.query_sessions({});

            expect(results).toHaveLength(1);
            expect(results[0].input_tokens).toBe(2000);
            expect(results[0].calls).toBe(20);
            expect(results[0].ended_at).toBe(1700002000000);
        });

        it("queries sessions with filters", () => {
            const sessions: TokenStatsSession[] = [
                {
                    id: "session-1",
                    source: "claude_code",
                    env: "win",
                    model: "claude-sonnet-4-20250514",
                    title: "Frontend work",
                    directory: "/home/user/frontend",
                    input_tokens: 1000,
                    output_tokens: 500,
                    cache_read_tokens: 200,
                    cache_write_tokens: 100,
                    calls: 10,
                    started_at: 1700000000000,
                    ended_at: 1700001000000,
                },
                {
                    id: "session-2",
                    source: "opencode",
                    env: "wsl",
                    model: "gpt-4",
                    title: "Backend work",
                    directory: "/home/user/backend",
                    input_tokens: 3000,
                    output_tokens: 1500,
                    cache_read_tokens: 600,
                    cache_write_tokens: 300,
                    calls: 30,
                    started_at: 1700002000000,
                    ended_at: 1700003000000,
                },
                {
                    id: "session-3",
                    source: "claude_code",
                    env: "win",
                    model: "claude-sonnet-4-20250514",
                    title: "API integration",
                    directory: "/home/user/api",
                    input_tokens: 5000,
                    output_tokens: 2500,
                    cache_read_tokens: 1000,
                    cache_write_tokens: 500,
                    calls: 50,
                    started_at: 1700004000000,
                    ended_at: 1700005000000,
                },
            ];

            store.upsert_sessions(sessions);

            // Filter by source
            const claude_sessions = store.query_sessions({ source: "claude_code" });
            expect(claude_sessions).toHaveLength(2);

            // Filter by env
            const wsl_sessions = store.query_sessions({ env: "wsl" });
            expect(wsl_sessions).toHaveLength(1);

            // Filter by search (title)
            const frontend_sessions = store.query_sessions({ search: "Frontend" });
            expect(frontend_sessions).toHaveLength(1);
            expect(frontend_sessions[0].title).toBe("Frontend work");

            // Filter by search (directory)
            const api_sessions = store.query_sessions({ search: "api" });
            expect(api_sessions).toHaveLength(1);

            // Combined filters
            const combined = store.query_sessions({
                source: "claude_code",
                search: "API",
            });
            expect(combined).toHaveLength(1);
            expect(combined[0].id).toBe("session-3");
        });
    });

    it("close() works without error", () => {
        const temp_store = create_token_stats_store(":memory:");
        expect(() => {
            temp_store.close();
        }).not.toThrow();
    });
});
