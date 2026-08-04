import { describe, expect, it } from "vitest";
import {
    tokenStatsDashboardDtoSchema,
    tokenStatsDashboardQuerySchema,
} from "../../../src/shared/types/token-stats";

const query = {
    agent: "all",
    platform: "all",
    start: 1_000,
    end: 2_000,
    metric: "tokens",
    xaxis: "time",
    gran: "hour",
} as const;

describe("token stats dashboard query schema", () => {
    it("accepts the complete dashboard query", () => {
        expect(tokenStatsDashboardQuerySchema.safeParse(query).success).toBe(true);
    });

    it("rejects invalid range and enum values", () => {
        expect(
            tokenStatsDashboardQuerySchema.safeParse({ ...query, end: query.start }).success,
        ).toBe(false);
        expect(
            tokenStatsDashboardQuerySchema.safeParse({ ...query, platform: "linux" }).success,
        ).toBe(false);
        expect(tokenStatsDashboardQuerySchema.safeParse({ ...query, metric: "cost" }).success).toBe(
            false,
        );
    });

    it("accepts an optional model filter and rejects oversized model names", () => {
        expect(
            tokenStatsDashboardQuerySchema.safeParse({ ...query, model: "sonnet" }).success,
        ).toBe(true);
        expect(
            tokenStatsDashboardQuerySchema.safeParse({ ...query, model: "x".repeat(201) }).success,
        ).toBe(false);
    });

    it("rejects alias and pagination bounds", () => {
        const aliases = (count: number) =>
            Array.from({ length: count }, (_, index) => ({
                alias: `a${String(index)}`,
                keys: ["k"],
            }));
        expect(
            tokenStatsDashboardQuerySchema.safeParse({
                ...query,
                dir_aliases: aliases(21),
            }).success,
        ).toBe(false);
        expect(
            tokenStatsDashboardQuerySchema.safeParse({
                ...query,
                model_aliases: [
                    { alias: "x", keys: Array.from({ length: 101 }, (_, i) => `k${String(i)}`) },
                ],
            }).success,
        ).toBe(false);
        expect(
            tokenStatsDashboardQuerySchema.safeParse({
                ...query,
                session_offset: 100_001,
            }).success,
        ).toBe(false);
        expect(
            tokenStatsDashboardQuerySchema.safeParse({
                ...query,
                session_limit: 0,
            }).success,
        ).toBe(false);
        expect(
            tokenStatsDashboardQuerySchema.safeParse({
                ...query,
                session_limit: 101,
            }).success,
        ).toBe(false);
    });

    it("rejects ranges that exceed the bucket cap", () => {
        // 401 day buckets over the 400-bucket limit.
        expect(
            tokenStatsDashboardQuerySchema.safeParse({
                ...query,
                start: 1_000,
                end: 1_000 + 401 * 24 * 3600_000,
                gran: "day",
            }).success,
        ).toBe(false);
    });
});

describe("token stats dashboard DTO schema", () => {
    it("requires bounded summary, chart, sessions, status and freshness", () => {
        const result = tokenStatsDashboardDtoSchema.safeParse({
            query,
            current: {
                tokens: 10,
                sessions: 1,
                calls: 2,
                input_tokens: 4,
                output_tokens: 3,
                cache_read_tokens: 2,
                cache_write_tokens: 1,
                agent_totals: [{ key: "claude_code", value: 10 }],
                model_token_totals: [{ key: "sonnet", value: 10 }],
                model_call_totals: [{ key: "sonnet", value: 2 }],
                project_session_totals: [{ key: "/p", value: 1 }],
            },
            previous: {
                tokens: 0,
                sessions: 0,
                calls: 0,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent_totals: [],
                model_token_totals: [],
                model_call_totals: [],
                project_session_totals: [],
            },
            chart_data: {
                axis: { labels: ["00:00"], bucket_starts: [1_000] },
                metric_buckets: [{ hour_start: 1_000, model: "sonnet", calls: 2, tokens: 10 }],
                session_buckets: [{ hour_start: 1_000, directory: "/p", sessions: 1 }],
                rollup: [],
            },
            heatmap: [{ weekday: 1, hour: 2, calls: 2, sessions: 1, tokens: 10 }],
            models: ["sonnet"],
            sessions: {
                items: [
                    {
                        session_id: "s1",
                        source: "claude_code",
                        env: "win",
                        title: "title",
                        directory: "/p",
                        models: ["sonnet"],
                        input_tokens: 4,
                        output_tokens: 3,
                        cache_read_tokens: 2,
                        cache_write_tokens: 1,
                        calls: 2,
                        started_at: 1_000,
                        ended_at: 1_500,
                    },
                ],
                total: 1,
                has_more: false,
            },
            status: { running: true, last_updated: 1_500 },
            freshness: { queried_at: 1_600, stale: false },
            data_version: 0,
        });
        expect(result.success).toBe(true);
    });

    it("rejects malformed DTOs that violate the bounded contract", () => {
        const summary = {
            tokens: 10,
            sessions: 1,
            calls: 2,
            input_tokens: 4,
            output_tokens: 3,
            cache_read_tokens: 2,
            cache_write_tokens: 1,
            agent_totals: [{ key: "claude_code", value: 10 }],
            model_token_totals: [{ key: "sonnet", value: 10 }],
            model_call_totals: [{ key: "sonnet", value: 2 }],
            project_session_totals: [{ key: "/p", value: 1 }],
        };
        const session_item = {
            session_id: "s1",
            source: "claude_code",
            env: "win",
            title: "title",
            directory: "/p",
            models: ["sonnet"],
            input_tokens: 4,
            output_tokens: 3,
            cache_read_tokens: 2,
            cache_write_tokens: 1,
            calls: 2,
            started_at: 1_000,
            ended_at: 1_500,
        };
        const base = {
            query,
            current: summary,
            previous: {
                ...summary,
                tokens: 0,
                sessions: 0,
                calls: 0,
                agent_totals: [],
                model_token_totals: [],
                model_call_totals: [],
                project_session_totals: [],
            },
            chart_data: {
                axis: { labels: ["00:00"], bucket_starts: [1_000] },
                metric_buckets: [{ hour_start: 1_000, model: "sonnet", calls: 2, tokens: 10 }],
                session_buckets: [{ hour_start: 1_000, directory: "/p", sessions: 1 }],
                rollup: [],
            },
            heatmap: [{ weekday: 1, hour: 2, calls: 2, sessions: 1, tokens: 10 }],
            models: ["sonnet"],
            sessions: { items: [session_item], total: 1, has_more: false },
            status: { running: true, last_updated: 1_500 },
            freshness: { queried_at: 1_600, stale: false },
            data_version: 3,
        };
        expect(tokenStatsDashboardDtoSchema.safeParse(base).success).toBe(true);
        expect(
            tokenStatsDashboardDtoSchema.safeParse({
                ...base,
                sessions: {
                    ...base.sessions,
                    items: Array.from({ length: 101 }, (_, i) => ({
                        ...session_item,
                        session_id: `s${String(i)}`,
                    })),
                },
            }).success,
        ).toBe(false);
        expect(
            tokenStatsDashboardDtoSchema.safeParse({
                ...base,
                current: { ...base.current, model_token_totals: [{ key: "sonnet", value: -1 }] },
            }).success,
        ).toBe(false);
        expect(
            tokenStatsDashboardDtoSchema.safeParse({
                ...base,
                models: Array.from({ length: 501 }, (_, i) => `m${String(i)}`),
            }).success,
        ).toBe(false);
        expect(
            tokenStatsDashboardDtoSchema.safeParse({
                ...base,
                sessions: {
                    ...base.sessions,
                    items: [{ ...session_item, env: "linux" }],
                },
            }).success,
        ).toBe(false);
        expect(
            tokenStatsDashboardDtoSchema.safeParse({
                ...base,
                chart_data: {
                    ...base.chart_data,
                    metric_buckets: Array.from({ length: 40_001 }, (_, i) => ({
                        hour_start: i,
                        model: "sonnet",
                        calls: 1,
                        tokens: 1,
                    })),
                },
            }).success,
        ).toBe(false);
    });
});
