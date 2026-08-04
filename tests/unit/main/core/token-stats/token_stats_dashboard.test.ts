import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    create_token_stats_store,
    type TokenStatsStore,
} from "../../../../../src/main/core/token-stats/token-stats-store";
import type { AgentSessionUsageRecord } from "../../../../../src/shared/types/token-stats";

const START = new Date("2026-07-10T08:00:00Z").getTime();
const END = START + 60 * 60 * 1000;

function record(overrides: Partial<AgentSessionUsageRecord> = {}): AgentSessionUsageRecord {
    return {
        session_id: "s1",
        title: "title",
        directory: "/project",
        slug: null,
        version: null,
        parent_session_id: null,
        message_id: "m1",
        role: "assistant",
        timestamp: START + 1_000,
        model: "sonnet",
        input_tokens: 10,
        output_tokens: 5,
        cache_read_tokens: 2,
        cache_write_tokens: 1,
        agent: "claude-code",
        source: "claude_code",
        env: "win",
        ...overrides,
    };
}

describe("token stats dashboard query", () => {
    let store: TokenStatsStore;

    beforeEach(() => {
        store = create_token_stats_store(":memory:");
    });

    afterEach(() => {
        store.close();
    });

    it("returns one bounded DTO with complete current and previous aggregates", () => {
        store.upsert_records([
            record({ message_id: "cur-1" }),
            record({
                message_id: "cur-2",
                timestamp: START + 2_000,
                model: "opus",
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
            }),
            record({
                message_id: "prev-1",
                timestamp: START - 1_000,
                input_tokens: 3,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
            }),
        ]);

        const dashboard = store.query_dashboard(
            {
                agent: "all",
                platform: "all",
                start: START,
                end: END,
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
            },
            { running: true, last_updated: null },
        );

        expect(dashboard.current).toMatchObject({ tokens: 18, sessions: 1, calls: 2 });
        expect(dashboard.previous).toMatchObject({ tokens: 3, sessions: 1, calls: 1 });
        expect(
            dashboard.chart_data.metric_buckets.reduce((sum, bucket) => sum + bucket.tokens, 0),
        ).toBe(18);
        expect(dashboard.sessions.items).toHaveLength(1);
        expect(dashboard.status.running).toBe(true);
        expect(dashboard.freshness.stale).toBe(false);
    });

    it("uses half-open current and previous windows at exact boundaries", () => {
        const start = 1_000;
        const end = 2_000;
        store.upsert_records([
            record({ message_id: "current-start", timestamp: start }),
            record({ message_id: "current-end-minus-one", timestamp: end - 1 }),
            record({ message_id: "excluded-end", timestamp: end }),
            record({ message_id: "previous-start", timestamp: start - (end - start) }),
        ]);

        const result = store.query_dashboard(
            {
                agent: "all",
                platform: "all",
                start,
                end,
                metric: "calls",
                xaxis: "time",
                gran: "hour",
            },
            { running: false, last_updated: null },
        );

        expect(result.current.calls).toBe(2);
        expect(result.previous.calls).toBe(1);
    });

    it("keeps high-density DTO dimensions bounded by aggregate groups", () => {
        store.upsert_records(
            Array.from({ length: 2_000 }, (_, index) =>
                record({
                    message_id: `dense-${String(index)}`,
                    timestamp: START + (index % 1000),
                }),
            ),
        );

        const result = store.query_dashboard(
            {
                agent: "all",
                platform: "all",
                start: START,
                end: END,
                metric: "tokens",
                xaxis: "session",
                gran: "day",
            },
            { running: true, last_updated: null },
        );

        expect(result.current.calls).toBe(2_000);
        expect(result.current.sessions).toBe(1);
        expect(result.sessions.items).toHaveLength(1);
        expect(result.sessions.total).toBe(1);
        expect(result.chart_data.axis.labels).toHaveLength(1);
        expect(result.current.model_token_totals).toHaveLength(1);
        expect(JSON.stringify(result).length).toBeLessThan(10_000);
    });

    it("keeps summary totals complete when model cardinality exceeds the visible top five", () => {
        store.upsert_records(
            Array.from({ length: 21 }, (_, index) =>
                record({
                    message_id: `model-${String(index)}`,
                    model: `model-${String(index)}`,
                    input_tokens: index + 1,
                    output_tokens: 0,
                    cache_read_tokens: 0,
                    cache_write_tokens: 0,
                }),
            ),
        );

        const result = store.query_dashboard(
            {
                agent: "all",
                platform: "all",
                start: START,
                end: END,
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
            },
            { running: true, last_updated: null },
        );

        expect(result.current.model_token_totals).toHaveLength(6);
        expect(result.current.model_token_totals.at(-1)).toEqual({ key: "其他", value: 136 });
        expect(result.current.model_token_totals.reduce((sum, item) => sum + item.value, 0)).toBe(
            result.current.tokens,
        );
    });

    it("applies model aliases before top-five aggregation", () => {
        store.upsert_records(
            Array.from({ length: 6 }, (_, index) =>
                record({
                    message_id: `alias-${String(index)}`,
                    model: `m${String(index + 1)}`,
                    input_tokens: [100, 90, 80, 70, 60, 1][index] ?? 0,
                    output_tokens: 0,
                    cache_read_tokens: 0,
                    cache_write_tokens: 0,
                }),
            ),
        );

        const result = store.query_dashboard(
            {
                agent: "all",
                platform: "all",
                start: START,
                end: END,
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
                model_aliases: [{ alias: "X", keys: ["m1", "m6"] }],
            },
            { running: true, last_updated: null },
        );

        expect(result.current.model_token_totals).toContainEqual({ key: "X", value: 101 });
        // chart_data carries raw model buckets; alias resolution happens in the
        // renderer derivation (t200).
        expect(
            result.chart_data.metric_buckets
                .filter((bucket) => bucket.model === "m1" || bucket.model === "m6")
                .reduce((sum, bucket) => sum + bucket.tokens, 0),
        ).toBe(101);
    });
    it("pages session summaries without expanding the dashboard payload", () => {
        store.upsert_records(
            Array.from({ length: 101 }, (_, index) =>
                record({
                    session_id: `page-${String(index)}`,
                    message_id: `page-message-${String(index)}`,
                    timestamp: START + index,
                }),
            ),
        );

        const result = store.query_dashboard(
            {
                agent: "all",
                platform: "all",
                start: START,
                end: END,
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
                session_offset: 100,
                session_limit: 1,
            },
            { running: true, last_updated: null },
        );

        expect(result.sessions.items).toHaveLength(1);
        expect(result.sessions.total).toBe(101);
        // offset 100 is the last row: nothing remains beyond the returned page.
        expect(result.sessions.has_more).toBe(false);
        expect(result.query.session_offset).toBe(100);
    });
    it("reports has_more when a bounded page does not reach the tail", () => {
        store.upsert_records(
            Array.from({ length: 101 }, (_, index) =>
                record({
                    session_id: `mid-${String(index)}`,
                    message_id: `mid-message-${String(index)}`,
                    timestamp: START + index,
                }),
            ),
        );

        const result = store.query_dashboard(
            {
                agent: "all",
                platform: "all",
                start: START,
                end: END,
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
                session_offset: 0,
                session_limit: 100,
            },
            { running: true, last_updated: null },
        );

        expect(result.sessions.items).toHaveLength(100);
        expect(result.sessions.total).toBe(101);
        expect(result.sessions.has_more).toBe(true);
    });
    it("matches an independent raw-record oracle for current and previous windows", () => {
        const width = END - START;
        const records = [
            record({ message_id: "cur-1", timestamp: START }),
            record({
                message_id: "cur-2",
                timestamp: START + width - 1,
                model: "opus",
                input_tokens: 20,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
            }),
            record({ message_id: "prev-1", timestamp: START - 1, input_tokens: 7 }),
            record({ message_id: "prev-2", timestamp: START - width, input_tokens: 3 }),
            record({ message_id: "excluded-end", timestamp: END }),
            record({ message_id: "excluded-prev", timestamp: START - width - 1 }),
        ];
        store.upsert_records(records);

        const result = store.query_dashboard(
            {
                agent: "all",
                platform: "all",
                start: START,
                end: END,
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
            },
            { running: true, last_updated: null },
        );

        const tokens_of = (rows: typeof records) =>
            rows.reduce(
                (sum, row) =>
                    sum +
                    row.input_tokens +
                    row.output_tokens +
                    row.cache_read_tokens +
                    row.cache_write_tokens,
                0,
            );
        const sessions_of = (rows: typeof records) =>
            new Set(rows.map((row) => `${row.source}|${row.env}|${row.session_id}`)).size;
        const in_window = (rows: typeof records, start: number, end: number) =>
            rows.filter((row) => row.timestamp >= start && row.timestamp < end);

        const current_rows = in_window(records, START, END);
        const previous_rows = in_window(records, START - width, START);
        expect(result.current.tokens).toBe(tokens_of(current_rows));
        expect(result.current.sessions).toBe(sessions_of(current_rows));
        expect(result.current.calls).toBe(current_rows.length);
        expect(result.previous.tokens).toBe(tokens_of(previous_rows));
        expect(result.previous.sessions).toBe(sessions_of(previous_rows));
        expect(result.previous.calls).toBe(previous_rows.length);
    });
    it("keeps the DTO flat as message count grows under a fixed grouping", () => {
        const query = {
            agent: "all",
            platform: "all",
            start: START,
            end: END,
            metric: "tokens",
            xaxis: "time",
            gran: "hour",
        } as const;
        store.upsert_records(
            Array.from({ length: 500 }, (_, index) =>
                record({
                    message_id: `grow-500-${String(index)}`,
                    timestamp: START + (index % 50),
                }),
            ),
        );
        const size_500 = JSON.stringify(
            store.query_dashboard(query, { running: true, last_updated: null }),
        ).length;
        store.upsert_records(
            Array.from({ length: 1500 }, (_, index) =>
                record({
                    message_id: `grow-2000-${String(index)}`,
                    timestamp: START + (index % 50),
                }),
            ),
        );
        const size_2000 = JSON.stringify(
            store.query_dashboard(query, { running: true, last_updated: null }),
        ).length;
        // 4x more messages, same 1 bucket / 1 session / 1 model grouping: the DTO
        // only grows by the few digits in the numeric counters, never linearly.
        expect(size_2000).toBeLessThanOrEqual(size_500 + 500);
    });
    it("counts sessions by source and platform identity in time chart and heatmap", () => {
        store.upsert_records([
            record({ message_id: "same-win", source: "claude_code", env: "win" }),
            record({ message_id: "same-wsl", source: "opencode", env: "wsl", agent: "opencode" }),
        ]);

        const result = store.query_dashboard(
            {
                agent: "all",
                platform: "all",
                start: START,
                end: END,
                metric: "sessions",
                xaxis: "time",
                gran: "hour",
            },
            { running: true, last_updated: null },
        );

        expect(result.current.sessions).toBe(2);
        expect(
            result.chart_data.session_buckets.reduce((sum, bucket) => sum + bucket.sessions, 0),
        ).toBe(2);
        expect(result.heatmap.reduce((sum, cell) => sum + cell.sessions, 0)).toBe(2);
    });

    it("uses one range and filter semantic across platform and agent", () => {
        store.upsert_records([
            record({ message_id: "win", agent: "claude-code", source: "claude_code", env: "win" }),
            record({
                message_id: "wsl",
                agent: "opencode",
                source: "opencode",
                env: "wsl",
            }),
        ]);

        const dashboard = store.query_dashboard(
            {
                agent: "opencode",
                platform: "wsl",
                start: START,
                end: END,
                metric: "calls",
                xaxis: "project",
                gran: "day",
            },
            { running: false, last_updated: 42 },
        );

        expect(dashboard.current.calls).toBe(1);
        expect(dashboard.current.agent_totals).toEqual([{ key: "opencode", value: 18 }]);
        expect(dashboard.sessions.items[0]?.env).toBe("wsl");
        expect(dashboard.status).toEqual({ running: false, last_updated: 42 });
    });

    it("exposes metric-agnostic chart_data with all metrics per bucket (t200)", () => {
        store.upsert_records([
            record({ message_id: "a", model: "sonnet", input_tokens: 10, output_tokens: 5 }),
            record({
                message_id: "b",
                model: "opus",
                input_tokens: 3,
                output_tokens: 0,
                cache_read_tokens: 1,
                cache_write_tokens: 0,
            }),
        ]);

        const tokens = store.query_dashboard(
            {
                agent: "all",
                platform: "all",
                start: START,
                end: END,
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
            },
            { running: true, last_updated: null },
        );
        const calls = store.query_dashboard(
            {
                agent: "all",
                platform: "all",
                start: START,
                end: END,
                metric: "calls",
                xaxis: "time",
                gran: "hour",
            },
            { running: true, last_updated: null },
        );

        // Same data identity → identical chart_data regardless of metric.
        expect(calls.chart_data.metric_buckets).toEqual(tokens.chart_data.metric_buckets);
        expect(tokens.chart_data.metric_buckets).toHaveLength(2);
        expect(tokens.chart_data.metric_buckets.reduce((sum, b) => sum + b.tokens, 0)).toBe(22);
        expect(tokens.chart_data.metric_buckets.reduce((sum, b) => sum + b.calls, 0)).toBe(2);
        expect(tokens.chart_data.session_buckets.reduce((sum, b) => sum + b.sessions, 0)).toBe(1);
        expect(tokens.chart_data.rollup).toHaveLength(2);
        expect(tokens.chart_data.axis.labels.length).toBeGreaterThanOrEqual(1);
    });

    it("sessions metric chart_data buckets are per-directory distinct (t200)", () => {
        store.upsert_records([
            record({ message_id: "s1-a", session_id: "s1", directory: "/a", model: "sonnet" }),
            record({ message_id: "s1-b", session_id: "s1", directory: "/a", model: "opus" }),
            record({ message_id: "s2-a", session_id: "s2", directory: "/b", model: "sonnet" }),
        ]);

        const result = store.query_dashboard(
            {
                agent: "all",
                platform: "all",
                start: START,
                end: END,
                metric: "sessions",
                xaxis: "time",
                gran: "hour",
            },
            { running: true, last_updated: null },
        );

        // s1 spans two models in the same hour → still counted once per directory.
        const by_dir = new Map<string, number>();
        for (const bucket of result.chart_data.session_buckets) {
            by_dir.set(bucket.directory, (by_dir.get(bucket.directory) ?? 0) + bucket.sessions);
        }
        expect(by_dir.get("/a")).toBe(1);
        expect(by_dir.get("/b")).toBe(1);
    });

    it("query_dashboard_sessions returns a bounded session page (t200)", () => {
        store.upsert_records(
            Array.from({ length: 15 }, (_, index) =>
                record({
                    session_id: `page-${String(index)}`,
                    message_id: `page-message-${String(index)}`,
                    timestamp: START + index,
                }),
            ),
        );

        const page = store.query_dashboard_sessions({
            agent: "all",
            platform: "all",
            start: START,
            end: END,
            session_offset: 10,
            session_limit: 5,
        });

        expect(page.items).toHaveLength(5);
        expect(page.total).toBe(15);
        expect(page.has_more).toBe(false);

        const tail = store.query_dashboard_sessions({
            agent: "all",
            platform: "all",
            start: START,
            end: END,
            session_offset: 0,
            session_limit: 10,
        });
        expect(tail.items).toHaveLength(10);
        expect(tail.has_more).toBe(true);
    });

    it("AC1: materializes the current and previous windows once and derives every region from temp tables", () => {
        const sqls: string[] = [];
        const traced = create_token_stats_store(":memory:", { on_sql: (s) => sqls.push(s) });
        traced.upsert_records([record({ message_id: "a" }), record({ message_id: "b" })]);
        traced.query_dashboard(
            {
                agent: "all",
                platform: "all",
                start: START,
                end: END,
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
            },
            { running: true, last_updated: null },
        );

        // One window materialization for current and one for previous — no
        // per-region re-scans of the base tables (p027).
        const window_creates = sqls.filter((s) => s.includes("CREATE TEMP TABLE window_rows"));
        expect(window_creates).toHaveLength(2);

        // Fallback store (rollup not ready): the ONLY statements that touch the
        // base table are the two window materializations plus the one session
        // meta materialization plus the window_models materialization (t204). A
        // region silently regressing to read token_stats_records directly
        // would push this count up and fail here.
        const records_refs = sqls.filter((s) => s.includes("token_stats_records"));
        expect(records_refs).toHaveLength(4);
        for (const s of records_refs) {
            expect(s.startsWith("CREATE TEMP TABLE")).toBe(true);
        }
        expect(sqls.some((s) => s.includes("token_stats_hour_rollup"))).toBe(false);

        // Every region reads from the materialized temp tables; none re-touch
        // token_stats_hour_rollup / token_stats_records directly.
        const region_sqls = sqls.filter(
            (s) => s.includes(" FROM window_rows") || s.includes(" FROM session_meta"),
        );
        expect(region_sqls.length).toBeGreaterThan(1);
        for (const s of region_sqls) {
            expect(s).not.toMatch(/token_stats_hour_rollup|token_stats_records/);
        }
        traced.close();
    });

    it("AC2: session metadata comes from one window-level query, not per-session correlated subqueries", () => {
        const sqls: string[] = [];
        const traced = create_token_stats_store(":memory:", { on_sql: (s) => sqls.push(s) });
        traced.upsert_records([record({ message_id: "a" }), record({ message_id: "b" })]);
        traced.query_dashboard(
            {
                agent: "all",
                platform: "all",
                start: START,
                end: END,
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
            },
            { running: true, last_updated: null },
        );
        traced.query_dashboard_sessions({
            agent: "all",
            platform: "all",
            start: START,
            end: END,
            session_offset: 0,
            session_limit: 10,
        });

        const session_meta = sqls.find((s) => s.includes("CREATE TEMP TABLE session_meta"));
        expect(session_meta).toBeTruthy();
        // A single window-level latest-per-session pass — no `WHERE t2.`
        // correlated subquery per session (p028).
        expect(session_meta).toContain("ROW_NUMBER() OVER");
        expect(session_meta).not.toMatch(/WHERE t2\./);
        traced.close();
    });

    it("AC3: freshness.stale is false when the committed data version is unchanged", () => {
        store.upsert_records([record({ message_id: "a" }), record({ message_id: "b" })]);
        const dto = store.query_dashboard(
            {
                agent: "all",
                platform: "all",
                start: START,
                end: END,
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
            },
            { running: true, last_updated: null },
        );
        expect(dto.freshness.stale).toBe(false);
        expect(dto.data_version).toBe(1);
    });

    it("AC3: a committed data-version advance mid-query makes the response stale", () => {
        let injected = false;
        const traced = create_token_stats_store(":memory:", {
            on_sql: (s) => {
                // The first materialize statement runs after the start-version
                // read and before the end-version read; committing a batch here
                // advances data_version, so the response must report stale.
                if (!injected && s.startsWith("DROP TABLE IF EXISTS window_rows")) {
                    injected = true;
                    traced.upsert_records([record({ message_id: "mid-query" })]);
                }
            },
        });
        traced.upsert_records([record({ message_id: "a" }), record({ message_id: "b" })]);
        const dto = traced.query_dashboard(
            {
                agent: "all",
                platform: "all",
                start: START,
                end: END,
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
            },
            { running: true, last_updated: null },
        );
        expect(injected).toBe(true);
        expect(dto.freshness.stale).toBe(true);
        expect(dto.data_version).toBe(2);
        traced.close();
    });

    it("returns window distinct models and filters every dashboard region by model (t204)", () => {
        store.upsert_records([
            record({
                session_id: "s-sonnet-a",
                message_id: "a1",
                model: "sonnet",
                input_tokens: 10,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
            }),
            record({
                session_id: "s-sonnet-b",
                message_id: "a2",
                model: "sonnet",
                input_tokens: 5,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
            }),
            record({
                session_id: "s-opus",
                message_id: "b1",
                model: "opus",
                input_tokens: 7,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
            }),
            // Outside the window — must not appear in models or be filtered in.
            record({
                session_id: "s-outside",
                message_id: "x1",
                model: "gemini",
                timestamp: END + 60_000,
                input_tokens: 99,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
            }),
        ]);
        const base = {
            agent: "all" as const,
            platform: "all" as const,
            start: START,
            end: END,
            metric: "tokens" as const,
            xaxis: "time" as const,
            gran: "hour" as const,
        };
        const all = store.query_dashboard(base, { running: true, last_updated: null });
        expect(all.models).toEqual(["opus", "sonnet"]);
        expect(all.current.tokens).toBe(22);
        expect(all.current.sessions).toBe(3);
        expect(all.current.calls).toBe(3);

        const sonnet = store.query_dashboard(
            { ...base, model: "sonnet" },
            { running: true, last_updated: null },
        );
        expect(sonnet.current.tokens).toBe(15);
        expect(sonnet.current.sessions).toBe(2);
        expect(sonnet.current.calls).toBe(2);
        // Model options keep the whole window's model list even under a
        // filter, so the dropdown stays switchable (AC1).
        expect(sonnet.models).toEqual(["opus", "sonnet"]);
        // model_token_totals only contains the filtered model.
        expect(sonnet.current.model_token_totals).toEqual([{ key: "sonnet", value: 15 }]);
        // Heatmap / chart regions derive from the filtered window too.
        expect(sonnet.heatmap.reduce((sum, c) => sum + c.tokens, 0)).toBe(15);
        expect(sonnet.chart_data.metric_buckets.reduce((sum, b) => sum + b.tokens, 0)).toBe(15);
        expect(sonnet.sessions.items).toHaveLength(2);
    });

    it("query_dashboard_sessions filters sessions by model (t204)", () => {
        store.upsert_records([
            record({
                session_id: "s-sonnet",
                message_id: "a1",
                model: "sonnet",
                title: "Sonnet session",
            }),
            record({
                session_id: "s-opus",
                message_id: "b1",
                model: "opus",
                title: "Opus session",
            }),
        ]);

        const sonnet = store.query_dashboard_sessions({
            agent: "all",
            platform: "all",
            start: START,
            end: END,
            model: "sonnet",
        });
        expect(sonnet.total).toBe(1);
        expect(sonnet.items).toHaveLength(1);
        expect(sonnet.items[0]?.session_id).toBe("s-sonnet");
    });

    it("heatmap and hour buckets filters accept a model (t204)", () => {
        store.upsert_records([
            record({
                session_id: "s1",
                message_id: "a1",
                model: "sonnet",
                timestamp: START + 3_600_000,
            }),
            record({
                session_id: "s2",
                message_id: "b1",
                model: "opus",
                timestamp: START + 3_600_000,
            }),
        ]);
        const heat = store.query_heatmap({ start: START, end: END, model: "sonnet" });
        expect(heat.reduce((sum, c) => sum + c.tokens, 0)).toBe(18);
        const hours = store.query_hour_buckets({ start: START, end: END, model: "sonnet" });
        expect(hours.reduce((sum, h) => sum + h.tokens, 0)).toBe(18);
    });
});
