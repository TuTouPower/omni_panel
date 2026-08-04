import Database from "better-sqlite3";
import type {
    AgentSessionUsage,
    AgentSessionUsageRecord,
    TokenStatsBucket,
    TokenStatsDailyUpsert,
    TokenStatsDashboardDto,
    TokenStatsDashboardQuery,
    TokenStatsDashboardSummary,
    TokenStatsDashboardNamedValue,
    TokenStatsDashboardMetricBucket,
    TokenStatsDashboardSessionBucket,
    TokenStatsDashboardSessionSummary,
    TokenStatsDashboardSessionsDto,
    TokenStatsDashboardSessionsQuery,
    TokenStatsEnv,
    TokenStatsSource,
    TokenStatsHeatmapCell,
    TokenStatsHeatmapFilters,
    TokenStatsHourBucket,
    TokenStatsHourFilters,
    TokenStatsRecordFilters,
    TokenStatsRollupFilters,
    TokenStatsRollupRow,
    TokenStatsSession,
    TokenStatsSessionUpsert,
} from "../../../shared/types/token-stats";
import { createLogger } from "../../../shared/lib/logger";

/**
 * Default cap on records returned by query_records when the caller omits an
 * explicit limit. The agent panel's charts only render a bounded recent slice,
 * and the full table can reach hundreds of thousands of rows — an unbounded
 * SELECT materializes the whole result set in main-process memory and ships it
 * over IPC. Callers needing more must pass an explicit `limit`.
 */
export const DEFAULT_RECORDS_LIMIT = 5000;

export interface TokenStatsStore {
    /** Merge session deltas + daily usage rows, then recompute daily buckets. */
    upsert_sessions(deltas: TokenStatsSessionUpsert[], daily: TokenStatsDailyUpsert[]): void;
    /** Replace per-message records for changed sessions. */
    upsert_records(records: AgentSessionUsageRecord[]): void;
    query_buckets(filters: {
        source?: string;
        env?: string;
        from_date?: string;
        to_date?: string;
    }): TokenStatsBucket[];
    query_sessions(filters: {
        source?: string;
        env?: string;
        search?: string;
        limit?: number;
        offset?: number;
    }): TokenStatsSession[];
    query_records(filters: TokenStatsRecordFilters): AgentSessionUsage[];
    /** Weekday×hour aggregation over the records table (hourly heatmap, t170). */
    query_heatmap(filters: TokenStatsHeatmapFilters): TokenStatsHeatmapCell[];
    /**
     * Hour×model aggregation over the records table (time-axis hour bar, t173).
     * Groups by UTC+8 local whole hour; no LIMIT, so wide windows (>=7d) cannot
     * truncate early hours the way query_records' ORDER BY DESC LIMIT does.
     */
    query_hour_buckets(filters: TokenStatsHourFilters): TokenStatsHourBucket[];
    /**
     * Window rollup over the records table (24h KPI/donut/project/session axes,
     * t184). Groups by (source, model, directory, session_id) so the result
     * scales with session/model counts, not per-message volume; no LIMIT, so
     * high-density windows cannot truncate early data the way query_records'
     * ORDER BY DESC LIMIT does. Uses half-open `[start, end)` so current and
     * previous windows (the caller fetches `[start - width, start)`) never
     * share a boundary record.
     */
    query_range_rollup(filters: TokenStatsRollupFilters): TokenStatsRollupRow[];
    /** Unified bounded dashboard aggregate; never returns per-message records. */
    query_dashboard(
        query: TokenStatsDashboardQuery,
        status: { running: boolean; last_updated: number | null },
    ): TokenStatsDashboardDto;
    /** Bounded session page for dashboard pagination (t200); never recomputes
     *  the summary/chart/heatmap regions. */
    query_dashboard_sessions(
        query: TokenStatsDashboardSessionsQuery,
    ): TokenStatsDashboardSessionsDto;
    /** Monotonic data version; bumps once per committed records batch (t192). */
    get_data_version(): number;
    /** True once the hour rollup has been fully backfilled from records (t192). */
    is_hour_rollup_ready(): boolean;
    /**
     * Rebuild the hour rollup from the full records table and mark it ready.
     * Idempotent: interrupting and re-running converges to the same table.
     * Synchronous here; the caller decides when/where to run it off the hot path.
     */
    backfill_hour_rollup(): void;
    last_updated(): number | null;
    close(): void;
}

/**
 * t192: bounded incremental hour rollup schema plus single-row data-version and
 * readiness tables. Shared by INIT_SQL (fresh databases) and migration v6
 * (existing databases) so the derived-table DDL cannot drift between paths.
 */
const ROLLUP_INIT_SQL = `
-- t192: bounded incremental hour rollup. One row per (session, hour, model,
-- directory) group, aggregated from token_stats_records. Reads for arbitrary
-- windows split into whole local hours (this table) plus the window's partial
-- edge hours (records), so dashboard reads scale with hour×group count, not
-- per-message records. directory and agent participate in the PK so a session
-- that changes directory (or a query filtering by agent) splits into its own
-- groups, matching the records rollup grouping exactly.
CREATE TABLE IF NOT EXISTS token_stats_hour_rollup (
    source TEXT NOT NULL,
    env TEXT NOT NULL,
    session_id TEXT NOT NULL,
    hour_start INTEGER NOT NULL,
    model TEXT NOT NULL,
    directory TEXT,
    agent TEXT NOT NULL,
    calls INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (source, env, session_id, hour_start, model, directory, agent)
);

-- t192: single-row monotonic data version. Bumped once per committed collector
-- batch so renderer caches can decide staleness without trusting local clocks.
CREATE TABLE IF NOT EXISTS token_stats_data_version (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL DEFAULT 0
);
INSERT INTO token_stats_data_version (id, version) VALUES (1, 0)
    ON CONFLICT(id) DO NOTHING;

-- t192: single-row aggregate readiness flag. hour_rollup_ready flips to 1
-- only after a full backfill from token_stats_records; before that dashboard
-- reads fall back to the records path so a partially-filled rollup can never
-- serve incomplete data.
CREATE TABLE IF NOT EXISTS token_stats_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    hour_rollup_ready INTEGER NOT NULL DEFAULT 0
);
INSERT INTO token_stats_meta (id, hour_rollup_ready) VALUES (1, 0)
    ON CONFLICT(id) DO NOTHING;
`;

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS token_stats_buckets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    env TEXT NOT NULL,
    bucket_date TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    sessions INTEGER NOT NULL DEFAULT 0,
    calls INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    UNIQUE(source, env, bucket_date, model)
);

CREATE TABLE IF NOT EXISTS token_stats_sessions (
    id TEXT NOT NULL,
    source TEXT NOT NULL,
    env TEXT NOT NULL,
    model TEXT NOT NULL,
    title TEXT,
    directory TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    calls INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (id, source, env)
);

CREATE TABLE IF NOT EXISTS token_stats_daily (
    id TEXT NOT NULL,
    source TEXT NOT NULL,
    env TEXT NOT NULL,
    date TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    calls INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (id, source, env, date, model)
);

CREATE TABLE IF NOT EXISTS token_stats_records (
    source TEXT NOT NULL,
    env TEXT NOT NULL,
    session_id TEXT NOT NULL,
    title TEXT,
    directory TEXT,
    slug TEXT,
    version TEXT,
    parent_session_id TEXT,
    message_id TEXT NOT NULL,
    role TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    agent TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (message_id, source, env)
);

-- query_records filters by (env, timestamp range) with ORDER BY timestamp DESC.
-- Without this index the planner full-scans token_stats_records, which reaches
-- hundreds of thousands of rows. Composite (env, timestamp DESC) serves both the
-- range predicate and the ordering direction.
CREATE INDEX IF NOT EXISTS idx_records_env_ts ON token_stats_records(env, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_records_ts ON token_stats_records(timestamp);
CREATE INDEX IF NOT EXISTS idx_records_session_ts
    ON token_stats_records(source, env, session_id, timestamp DESC);
${ROLLUP_INIT_SQL}`;

// Buckets are fully derived from the daily usage table: rebuilt on every
// upsert batch so partial deltas can never drop or double-count usage.
const DELETE_BUCKETS_SQL = `DELETE FROM token_stats_buckets`;

const INSERT_BUCKETS_SQL = `
INSERT INTO token_stats_buckets (
    source, env, bucket_date, model,
    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
    sessions, calls, updated_at
)
SELECT source,
       env,
       date AS bucket_date,
       model,
       SUM(input_tokens),
       SUM(output_tokens),
       SUM(cache_read_tokens),
       SUM(cache_write_tokens),
       COUNT(DISTINCT id),
       SUM(calls),
       @now
FROM token_stats_daily
GROUP BY source, env, date, model;
`;

function row_to_bucket(row: Record<string, unknown>): TokenStatsBucket {
    return {
        source: row["source"] as TokenStatsBucket["source"],
        env: row["env"] as TokenStatsBucket["env"],
        bucket_date: row["bucket_date"] as string,
        model: row["model"] as string,
        input_tokens: row["input_tokens"] as number,
        output_tokens: row["output_tokens"] as number,
        cache_read_tokens: row["cache_read_tokens"] as number,
        cache_write_tokens: row["cache_write_tokens"] as number,
        sessions: row["sessions"] as number,
        calls: row["calls"] as number,
    };
}

function row_to_session(row: Record<string, unknown>): TokenStatsSession {
    return {
        id: row["id"] as string,
        source: row["source"] as TokenStatsSession["source"],
        env: row["env"] as TokenStatsSession["env"],
        model: row["model"] as string,
        title: row["title"] as string | null,
        directory: row["directory"] as string | null,
        input_tokens: row["input_tokens"] as number,
        output_tokens: row["output_tokens"] as number,
        cache_read_tokens: row["cache_read_tokens"] as number,
        cache_write_tokens: row["cache_write_tokens"] as number,
        calls: row["calls"] as number,
        started_at: row["started_at"] as number,
        ended_at: row["ended_at"] as number,
    };
}

function row_to_record(row: Record<string, unknown>): AgentSessionUsage {
    return {
        session_id: row["session_id"] as string,
        title: row["title"] as string | null,
        directory: row["directory"] as string | null,
        slug: row["slug"] as string | null,
        version: row["version"] as string | null,
        parent_session_id: row["parent_session_id"] as string | null,
        message_id: row["message_id"] as string,
        role: row["role"] as string,
        timestamp: row["timestamp"] as number,
        model: row["model"] as string,
        input_tokens: row["input_tokens"] as number,
        output_tokens: row["output_tokens"] as number,
        cache_read_tokens: row["cache_read_tokens"] as number,
        cache_write_tokens: row["cache_write_tokens"] as number,
        agent: row["agent"] as "claude-code" | "opencode" | "kimi-code" | "grok",
    };
}

function safe_int(v: unknown): number {
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

type DashboardRollupRow = TokenStatsRollupRow & { env: TokenStatsEnv };
interface DashboardAlias {
    alias: string;
    keys: readonly string[];
}

function dashboard_alias_resolver(
    aliases: readonly DashboardAlias[] | undefined,
): (key: string) => string {
    const lookup = new Map<string, string>();
    for (const item of aliases ?? []) {
        for (const key of item.keys) lookup.set(key, item.alias);
    }
    return (key) => lookup.get(key) ?? key;
}

function dashboard_named_values(totals: Map<string, number>): TokenStatsDashboardNamedValue[] {
    const ranked = [...totals.entries()]
        .filter(([, value]) => value > 0)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const values = ranked.slice(0, 5).map(([key, value]) => ({ key, value }));
    const other_value = ranked.slice(5).reduce((sum, [, value]) => sum + value, 0);
    if (other_value > 0) values.push({ key: "其他", value: other_value });
    return values;
}

function dashboard_summary_from_rollup(
    rows: DashboardRollupRow[],
    query: TokenStatsDashboardQuery,
): TokenStatsDashboardSummary {
    const directory_resolver = dashboard_alias_resolver(query.dir_aliases);
    const model_resolver = dashboard_alias_resolver(query.model_aliases);
    const agent_totals = new Map<string, number>();
    const model_token_totals = new Map<string, number>();
    const model_call_totals = new Map<string, number>();
    const project_sessions = new Map<string, Set<string>>();
    let input_tokens = 0;
    let output_tokens = 0;
    let cache_read_tokens = 0;
    let cache_write_tokens = 0;
    const session_keys = new Set<string>();
    for (const row of rows) {
        const tokens =
            row.input_tokens + row.output_tokens + row.cache_read_tokens + row.cache_write_tokens;
        const agent = row.source.replace(/_/g, "-");
        agent_totals.set(agent, (agent_totals.get(agent) ?? 0) + tokens);
        const model = model_resolver(row.model);
        model_token_totals.set(model, (model_token_totals.get(model) ?? 0) + tokens);
        model_call_totals.set(model, (model_call_totals.get(model) ?? 0) + row.calls);
        input_tokens += row.input_tokens;
        output_tokens += row.output_tokens;
        cache_read_tokens += row.cache_read_tokens;
        cache_write_tokens += row.cache_write_tokens;
        const session = `${row.source}|${row.env}|${row.session_id}`;
        session_keys.add(session);
        const project = directory_resolver(row.directory ?? "(unknown)");
        const sessions = project_sessions.get(project) ?? new Set<string>();
        sessions.add(session);
        project_sessions.set(project, sessions);
    }
    const project_session_totals = new Map<string, number>();
    for (const [project, sessions] of project_sessions) {
        project_session_totals.set(project, sessions.size);
    }
    return {
        tokens: input_tokens + output_tokens + cache_read_tokens + cache_write_tokens,
        sessions: session_keys.size,
        calls: rows.reduce((sum, row) => sum + row.calls, 0),
        input_tokens,
        output_tokens,
        cache_read_tokens,
        cache_write_tokens,
        agent_totals: dashboard_named_values(agent_totals),
        model_token_totals: dashboard_named_values(model_token_totals),
        model_call_totals: dashboard_named_values(model_call_totals),
        project_session_totals: dashboard_named_values(project_session_totals),
    };
}

function dashboard_local_boundary(
    timestamp: number,
    gran: TokenStatsDashboardQuery["gran"],
): number {
    const local = new Date(timestamp + 8 * 3600000);
    if (gran === "hour") {
        local.setUTCMinutes(0, 0, 0);
        local.setUTCHours(local.getUTCHours() + 1);
    } else {
        local.setUTCHours(0, 0, 0, 0);
        local.setUTCDate(local.getUTCDate() + 1);
    }
    return local.getTime() - 8 * 3600000;
}

function dashboard_label(timestamp: number, gran: TokenStatsDashboardQuery["gran"]): string {
    const local = new Date(timestamp + 8 * 3600000);
    const month = String(local.getUTCMonth() + 1);
    const day = String(local.getUTCDate());
    if (gran === "hour") {
        return `${month}/${day} ${String(local.getUTCHours()).padStart(2, "0")}:00`;
    }
    return `${month}/${day}`;
}

/** Builds the dashboard time-axis labels + bucket boundaries for a window at a
 *  gran. Shared with the renderer through chart_data.axis so the renderer maps
 *  metric/session buckets onto the exact same axis the server used (t200). */
function dashboard_chart_axis(
    start: number,
    end: number,
    gran: TokenStatsDashboardQuery["gran"],
): { labels: string[]; bucket_starts: number[] } {
    const bucket_starts: number[] = [start];
    let boundary = dashboard_local_boundary(start, gran);
    while (boundary < end) {
        bucket_starts.push(boundary);
        boundary = dashboard_local_boundary(boundary, gran);
    }
    return {
        labels: bucket_starts.map((timestamp) => dashboard_label(timestamp, gran)),
        bucket_starts,
    };
}

function build_dashboard_conditions(
    query: Pick<TokenStatsDashboardQuery, "agent" | "platform" | "model">,
    start: number,
    end: number,
): { conditions: string[]; params: Record<string, unknown> } {
    const conditions = ["timestamp >= @start", "timestamp < @end"];
    const params: Record<string, unknown> = { start, end };
    if (query.agent !== "all") {
        conditions.push("agent = @agent");
        params["agent"] = query.agent;
    }
    if (query.platform !== "all") {
        conditions.push("env = @env");
        params["env"] = query.platform;
    }
    if (query.model) {
        conditions.push("model = @model");
        params["model"] = query.model;
    }
    return { conditions, params };
}

/**
 * Unified window expansion shared by every dashboard region when the hour
 * rollup is ready. The window `[start, end)` splits into whole local hours
 * (token_stats_hour_rollup, one pre-aggregated cell per session/hour/model/
 * directory/agent group) plus the window's partial edge hours
 * (token_stats_records, raw rows). UNION ALL keeps the outer aggregate exact:
 * SUM(calls)/SUM(tokens) recompose correctly and COUNT(DISTINCT session)
 * de-duplicates across the two parts, while the rollup side scales with
 * hour×group count instead of per-message rows.
 */
function dashboard_window_union_builder(
    query: Pick<TokenStatsDashboardQuery, "agent" | "platform" | "model">,
): (start: number, end: number) => { sql: string; params: Record<string, unknown> } {
    const agent_where = query.agent !== "all" ? " AND agent = @agent" : "";
    const env_where = query.platform !== "all" ? " AND env = @env" : "";
    const model_where = query.model ? " AND model = @model" : "";
    const filter_params: Record<string, unknown> = {};
    if (query.agent !== "all") filter_params["agent"] = query.agent;
    if (query.platform !== "all") filter_params["env"] = query.platform;
    if (query.model) filter_params["model"] = query.model;
    return (start, end) => {
        const hs = start - ((start + 28800000) % 3600000);
        const full_start = hs === start ? hs : hs + 3600000;
        const full_end = end - ((end + 28800000) % 3600000);
        const params: Record<string, unknown> = {
            ...filter_params,
            start,
            end,
            full_start,
            full_end,
        };
        const has_full_hours = full_start < full_end;
        const rollup_part = has_full_hours
            ? `SELECT source, env, session_id, model, directory, agent, hour_start,
                    calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
                   FROM token_stats_hour_rollup
                   WHERE hour_start >= @full_start AND hour_start < @full_end${agent_where}${env_where}${model_where}`
            : `SELECT source, env, session_id, model, directory, agent, 0 AS hour_start,
                    0 AS calls, 0 AS input_tokens, 0 AS output_tokens, 0 AS cache_read_tokens,
                    0 AS cache_write_tokens
                   FROM token_stats_records WHERE 0`;
        // When there are whole hours the window splits into [start,
        // full_start) ∪ [full_start, full_end) ∪ [full_end, end) and the
        // rollup covers the middle. When there are none (full_start >
        // full_end) the two edge bands would overlap past the window —
        // e.g. [07:35, 08:00) ∪ [07:00, 07:55) covers [07:00, 08:00) —
        // so fall back to reading the whole window from records.
        const records_part = has_full_hours
            ? `SELECT source, env, session_id, model, directory, agent,
                    (timestamp - ((timestamp + 28800000) % 3600000)) AS hour_start,
                    1 AS calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
                FROM token_stats_records
                WHERE ((timestamp >= @start AND timestamp < @full_start)
                       OR (timestamp >= @full_end AND timestamp < @end))${agent_where}${env_where}${model_where}`
            : `SELECT source, env, session_id, model, directory, agent,
                    (timestamp - ((timestamp + 28800000) % 3600000)) AS hour_start,
                    1 AS calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
                FROM token_stats_records
                WHERE (timestamp >= @start AND timestamp < @end)${agent_where}${env_where}${model_where}`;
        return { sql: `(${rollup_part} UNION ALL ${records_part})`, params };
    };
}

/**
 * Full-window records source used when the hour rollup is not ready: the
 * whole `[start, end)` window reads raw records only (no rollup middle band).
 * Keeps the same column shape as the rollup-ready union so every dashboard
 * region shares one materialized window regardless of readiness (p031: single
 * implementation, no records/rollup dual track).
 */
function dashboard_records_source(
    query: Pick<TokenStatsDashboardQuery, "agent" | "platform" | "model">,
    start: number,
    end: number,
): { sql: string; params: Record<string, unknown> } {
    const { conditions, params } = build_dashboard_conditions(query, start, end);
    const sql = `SELECT source, env, session_id, model, directory, agent,
            (timestamp - ((timestamp + 28800000) % 3600000)) AS hour_start,
            1 AS calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
        FROM token_stats_records
        WHERE ${conditions.join(" AND ")}`;
    return { sql, params };
}

/**
 * Materialize one window into a TEMP TABLE once; every dashboard region then
 * derives from it (AC1, p027). The source is either the rollup+records union
 * (rollup ready) or the full-window records fallback (p031 single track).
 */
function materialize_window_rows(
    prepare: (sql: string) => Database.Statement,
    source: { sql: string; params: Record<string, unknown> },
): void {
    prepare("DROP TABLE IF EXISTS window_rows").run();
    prepare(
        `CREATE TEMP TABLE window_rows AS
            SELECT source, env, session_id, model, directory, agent, hour_start,
                   calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
            FROM (${source.sql})`,
    ).run(source.params);
}

/**
 * Materialize one window-level latest-per-session pass (p028): title/directory
 * from the newest record, started_at/ended_at as the window min/max, and the
 * aggregated per-session calls/tokens — all in a single windowed query instead
 * of N correlated subqueries. Every session-table read derives from this.
 */
function materialize_session_meta(
    prepare: (sql: string) => Database.Statement,
    query: Pick<TokenStatsDashboardQuery, "agent" | "platform" | "model">,
    start: number,
    end: number,
): void {
    const { conditions, params } = build_dashboard_conditions(query, start, end);
    prepare("DROP TABLE IF EXISTS session_meta").run();
    prepare(
        `CREATE TEMP TABLE session_meta AS
            SELECT source, env, session_id, title, directory, started_at, ended_at,
                   calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
            FROM (
                SELECT source, env, session_id, title, directory, timestamp,
                       MIN(timestamp) OVER (PARTITION BY source, env, session_id) AS started_at,
                       MAX(timestamp) OVER (PARTITION BY source, env, session_id) AS ended_at,
                       ROW_NUMBER() OVER (PARTITION BY source, env, session_id ORDER BY timestamp DESC) AS rn,
                       COUNT(*) OVER (PARTITION BY source, env, session_id) AS calls,
                       SUM(input_tokens) OVER (PARTITION BY source, env, session_id) AS input_tokens,
                       SUM(output_tokens) OVER (PARTITION BY source, env, session_id) AS output_tokens,
                       SUM(cache_read_tokens) OVER (PARTITION BY source, env, session_id) AS cache_read_tokens,
                       SUM(cache_write_tokens) OVER (PARTITION BY source, env, session_id) AS cache_write_tokens
                FROM token_stats_records
                WHERE ${conditions.join(" AND ")}
            ) WHERE rn = 1`,
    ).run(params);
}

/**
 * Read one rollup region from the materialized window. `join_title` attaches
 * the window-level latest title (session axis labels); the previous window's
 * rollup only feeds the summary, which ignores title, so it can skip the join.
 */
function read_rollup_from_window_rows(
    prepare: (sql: string) => Database.Statement,
    join_title: boolean,
): DashboardRollupRow[] {
    const title_select = join_title ? "m.title AS title" : "NULL AS title";
    const join_clause = join_title
        ? "LEFT JOIN session_meta m ON m.source = w.source AND m.env = w.env AND m.session_id = w.session_id"
        : "";
    const rows = prepare(
        `SELECT w.source, w.env, w.model, w.directory, w.session_id,
            ${title_select},
            SUM(w.calls) AS calls,
            SUM(w.input_tokens) AS input_tokens,
            SUM(w.output_tokens) AS output_tokens,
            SUM(w.cache_read_tokens) AS cache_read_tokens,
            SUM(w.cache_write_tokens) AS cache_write_tokens
         FROM window_rows w
         ${join_clause}
         GROUP BY w.source, w.env, w.session_id, w.model, w.directory, w.agent`,
    ).all() as Record<string, unknown>[];
    return rows.map(rollup_row_from);
}

function dashboard_session_page_from_meta(
    prepare: (sql: string) => Database.Statement,
    offset: number,
    limit: number,
): { total: number; rows: Record<string, unknown>[] } {
    const total = (prepare("SELECT COUNT(*) AS total FROM session_meta").get() as { total: number })
        .total;
    const rows = prepare(
        `SELECT source, env, session_id, title, directory, started_at, ended_at,
            calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
         FROM session_meta
         ORDER BY ended_at DESC, session_id ASC LIMIT @limit OFFSET @offset`,
    ).all({ limit, offset }) as Record<string, unknown>[];
    return { total, rows };
}

function rollup_row_from(row: Record<string, unknown>): DashboardRollupRow {
    return {
        source: row["source"] as TokenStatsSource,
        env: row["env"] as TokenStatsEnv,
        model: row["model"] as string,
        directory: row["directory"] as string | null,
        session_id: row["session_id"] as string,
        title: row["title"] as string | null,
        calls: row["calls"] as number,
        input_tokens: row["input_tokens"] as number,
        output_tokens: row["output_tokens"] as number,
        cache_read_tokens: row["cache_read_tokens"] as number,
        cache_write_tokens: row["cache_write_tokens"] as number,
    };
}

function dashboard_session_items(
    rows: Record<string, unknown>[],
    current_rollup: DashboardRollupRow[],
): TokenStatsDashboardSessionSummary[] {
    const model_map = new Map<string, Set<string>>();
    for (const row of current_rollup) {
        const key = `${row.source}|${row.env}|${row.session_id}`;
        const models = model_map.get(key) ?? new Set<string>();
        models.add(row.model);
        model_map.set(key, models);
    }
    return rows.map((row) => {
        const key = `${String(row["source"])}|${String(row["env"])}|${String(row["session_id"])}`;
        return {
            session_id: row["session_id"] as string,
            source: row["source"] as TokenStatsSource,
            env: row["env"] as TokenStatsEnv,
            title: row["title"] as string | null,
            directory: row["directory"] as string | null,
            models: [...(model_map.get(key) ?? new Set<string>())].slice(0, 50),
            input_tokens: row["input_tokens"] as number,
            output_tokens: row["output_tokens"] as number,
            cache_read_tokens: row["cache_read_tokens"] as number,
            cache_write_tokens: row["cache_write_tokens"] as number,
            calls: row["calls"] as number,
            started_at: row["started_at"] as number,
            ended_at: row["ended_at"] as number,
        };
    });
}

export function create_token_stats_store(
    db_path: string,
    options: { readonly?: boolean; on_sql?: (sql: string) => void } = {},
): TokenStatsStore {
    const log = createLogger("token-stats-store");
    const readonly = options.readonly === true;
    // Read-only connections back the isolated dashboard query worker (t193):
    // same read paths (including the t192 hour-rollup window read) against a
    // WAL database the main process writes concurrently. Schema/DDL and
    // migrations are skipped — the writable main-process store owns them.
    const db = readonly ? new Database(db_path, { readonly: true }) : new Database(db_path);
    db.pragma("busy_timeout = 5000");
    if (!readonly) {
        db.pragma("journal_mode = WAL");
        db.pragma("wal_autocheckpoint = 1000");
        db.exec(INIT_SQL);
    }
    // Migration v2: (1) daily `date` switched from collector-local to UTC
    // bucketing — local-dated rows would linger next to UTC rows and
    // double-count; (2) sessions of deleted transcript files were kept
    // forever, inflating per-window session counts. Both are derived data:
    // wipe once, the collector's full rescan on startup repopulates them.
    if (!readonly && (db.pragma("user_version", { simple: true }) as number) < 2) {
        db.exec(
            "DELETE FROM token_stats_daily; DELETE FROM token_stats_buckets; DELETE FROM token_stats_sessions;",
        );
        db.pragma("user_version = 2");
    }
    // Migration v3: add per-message records table. Records are fully
    // re-emitted by the collector on each rescan, so wipe legacy rows once.
    if (!readonly && (db.pragma("user_version", { simple: true }) as number) < 3) {
        db.exec("DELETE FROM token_stats_records;");
        db.pragma("user_version = 3");
    }
    // Migration v4: add idx_records_env_ts so query_records' (env, timestamp)
    // range + ORDER BY timestamp DESC uses an index seek instead of a full
    // scan. CREATE INDEX IF NOT EXISTS is idempotent; INIT_SQL already creates
    // it on fresh DBs, this branch backfills existing installs.
    if (!readonly && (db.pragma("user_version", { simple: true }) as number) < 4) {
        db.exec(
            "CREATE INDEX IF NOT EXISTS idx_records_env_ts ON token_stats_records(env, timestamp DESC);",
        );
        db.pragma("user_version = 4");
    }
    // Migration v5: add timestamp and session lookup indexes used by the
    // bounded dashboard aggregate queries on existing databases.
    if (!readonly && (db.pragma("user_version", { simple: true }) as number) < 5) {
        db.exec(
            "CREATE INDEX IF NOT EXISTS idx_records_ts ON token_stats_records(timestamp);" +
                "CREATE INDEX IF NOT EXISTS idx_records_session_ts ON token_stats_records(source, env, session_id, timestamp DESC);",
        );
        db.pragma("user_version = 5");
    }
    // Migration v6: create the t192 hour rollup plus single-row data-version
    // and readiness tables on existing databases (INIT_SQL covers only fresh
    // DBs). The rollup stays empty and unready here; the store backfills it
    // asynchronously after open, and dashboard reads fall back to records
    // until `hour_rollup_ready` flips.
    if (!readonly && (db.pragma("user_version", { simple: true }) as number) < 6) {
        db.exec(ROLLUP_INIT_SQL);
        db.pragma("user_version = 6");
    }
    if (readonly) {
        log.debug(`Token stats read-only store initialized: ${db_path}`);
    } else {
        log.debug(`Token stats store initialized: ${db_path}`);
    }

    // Merge semantics per field:
    // - token totals / calls: cumulative snapshots — take the new value when
    //   the delta carries one (null = no information, keep existing)
    // - title / directory / model: same, first non-null wins over time
    // - started_at: MIN over all deltas (converges to the true session start)
    // - ended_at: MAX over all deltas
    // UPDATE first (COALESCE on existing columns); INSERT only when the row
    // is new, applying zero defaults there. (Doing this as a single UPSERT
    // would lose the null/0 distinction through the excluded pseudo-row.)
    const update_session_stmt = db.prepare(`
        UPDATE token_stats_sessions SET
            model = COALESCE(@model, model),
            title = COALESCE(@title, title),
            directory = COALESCE(@directory, directory),
            input_tokens = COALESCE(@input_tokens, input_tokens),
            output_tokens = COALESCE(@output_tokens, output_tokens),
            cache_read_tokens = COALESCE(@cache_read_tokens, cache_read_tokens),
            cache_write_tokens = COALESCE(@cache_write_tokens, cache_write_tokens),
            calls = COALESCE(@calls, calls),
            started_at = MIN(started_at, @started_at),
            ended_at = MAX(ended_at, @ended_at),
            updated_at = @updated_at
        WHERE id = @id AND source = @source AND env = @env
    `);

    const insert_session_stmt = db.prepare(`
        INSERT INTO token_stats_sessions (
            id, source, env, model, title, directory,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
            calls, started_at, ended_at, updated_at
        ) VALUES (
            @id, @source, @env, COALESCE(@model, 'unknown'), @title, @directory,
            COALESCE(@input_tokens, 0), COALESCE(@output_tokens, 0),
            COALESCE(@cache_read_tokens, 0), COALESCE(@cache_write_tokens, 0),
            COALESCE(@calls, 0), @started_at, @ended_at, @updated_at
        )
    `);

    const delete_buckets_stmt = db.prepare(DELETE_BUCKETS_SQL);
    const insert_buckets_stmt = db.prepare(INSERT_BUCKETS_SQL);

    // Daily rows are full recounts per (session, date, model) — plain REPLACE
    const upsert_daily_stmt = db.prepare(`
        INSERT OR REPLACE INTO token_stats_daily (
            id, source, env, date, model,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
            calls, updated_at
        ) VALUES (
            @id, @source, @env, @date, @model,
            @input_tokens, @output_tokens, @cache_read_tokens, @cache_write_tokens,
            @calls, @updated_at
        )
    `);

    // Per-message records are full recounts per changed session — REPLACE by PK.
    const upsert_record_stmt = db.prepare(`
        INSERT OR REPLACE INTO token_stats_records (
            source, env, session_id, title, directory, slug, version,
            parent_session_id, message_id, role, timestamp, model,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
            agent, updated_at
        ) VALUES (
            @source, @env, @session_id, @title, @directory, @slug, @version,
            @parent_session_id, @message_id, @role, @timestamp, @model,
            @input_tokens, @output_tokens, @cache_read_tokens, @cache_write_tokens,
            @agent, @updated_at
        )
    `);

    // t192: per-session hour rollup. Each changed session's rollup rows are
    // deleted then fully re-aggregated from the records table — the collector
    // re-emits a complete recount per changed session, so REPLACE-by-PK makes
    // the session the correct incremental unit. Full rebuild also sidesteps the
    // NULL-directory UPSERT pitfall: SQLite treats NULL unique-key values as
    // always distinct, so a row-level ON CONFLICT upsert could never match the
    // NULL-directory group and would stack duplicate rows.
    const delete_hour_rollup_session_stmt = db.prepare(`
        DELETE FROM token_stats_hour_rollup
        WHERE source = @source AND env = @env AND session_id = @session_id
    `);
    const rebuild_hour_rollup_session_stmt = db.prepare(`
        INSERT INTO token_stats_hour_rollup (
            source, env, session_id, hour_start, model, directory, agent,
            calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
            updated_at
        )
        SELECT source, env, session_id,
            (timestamp - ((timestamp + 28800000) % 3600000)) AS hour_start,
            model, directory, agent,
            COUNT(*) AS calls,
            SUM(input_tokens) AS input_tokens,
            SUM(output_tokens) AS output_tokens,
            SUM(cache_read_tokens) AS cache_read_tokens,
            SUM(cache_write_tokens) AS cache_write_tokens,
            @now AS updated_at
        FROM token_stats_records
        WHERE source = @source AND env = @env AND session_id = @session_id
        GROUP BY source, env, session_id, hour_start, model, directory, agent
    `);
    const bump_data_version_stmt = db.prepare(`
        UPDATE token_stats_data_version SET version = version + 1 WHERE id = 1
    `);
    const delete_hour_rollup_all_stmt = db.prepare(`DELETE FROM token_stats_hour_rollup`);
    const backfill_hour_rollup_stmt = db.prepare(`
        INSERT INTO token_stats_hour_rollup (
            source, env, session_id, hour_start, model, directory, agent,
            calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
            updated_at
        )
        SELECT source, env, session_id,
            (timestamp - ((timestamp + 28800000) % 3600000)) AS hour_start,
            model, directory, agent,
            COUNT(*) AS calls,
            SUM(input_tokens) AS input_tokens,
            SUM(output_tokens) AS output_tokens,
            SUM(cache_read_tokens) AS cache_read_tokens,
            SUM(cache_write_tokens) AS cache_write_tokens,
            @now AS updated_at
        FROM token_stats_records
        GROUP BY source, env, session_id, hour_start, model, directory, agent
    `);
    const mark_rollup_ready_stmt = db.prepare(`
        UPDATE token_stats_meta SET hour_rollup_ready = 1 WHERE id = 1
    `);
    const get_data_version_stmt = db.prepare(
        `SELECT version FROM token_stats_data_version WHERE id = 1`,
    );
    const get_rollup_ready_stmt = db.prepare(
        `SELECT hour_rollup_ready FROM token_stats_meta WHERE id = 1`,
    );

    return {
        upsert_sessions(deltas: TokenStatsSessionUpsert[], daily: TokenStatsDailyUpsert[]): void {
            if (readonly) {
                throw new Error("Token stats store is read-only");
            }
            if (deltas.length === 0 && daily.length === 0) {
                return;
            }
            const now = Date.now();
            const tx = db.transaction((items: TokenStatsSessionUpsert[]) => {
                for (const s of items) {
                    const params = {
                        id: s.id,
                        source: s.source,
                        env: s.env,
                        model: s.model,
                        title: s.title,
                        directory: s.directory,
                        input_tokens: s.input_tokens,
                        output_tokens: s.output_tokens,
                        cache_read_tokens: s.cache_read_tokens,
                        cache_write_tokens: s.cache_write_tokens,
                        calls: s.calls,
                        started_at: s.started_at,
                        ended_at: s.ended_at,
                        updated_at: now,
                    };
                    const result = update_session_stmt.run(params);
                    if (result.changes === 0) {
                        insert_session_stmt.run(params);
                    }
                }
                for (const d of daily) {
                    upsert_daily_stmt.run({
                        id: d.id,
                        source: d.source,
                        env: d.env,
                        date: d.date,
                        model: d.model,
                        input_tokens: d.input_tokens,
                        output_tokens: d.output_tokens,
                        cache_read_tokens: d.cache_read_tokens,
                        cache_write_tokens: d.cache_write_tokens,
                        calls: d.calls,
                        updated_at: now,
                    });
                }
                delete_buckets_stmt.run();
                insert_buckets_stmt.run({ now });
            });
            tx(deltas);
            log.debug(
                `Upserted ${String(deltas.length)} session deltas + ${String(daily.length)} daily rows, buckets recomputed`,
            );
        },

        upsert_records(records: AgentSessionUsageRecord[]): void {
            if (readonly) {
                throw new Error("Token stats store is read-only");
            }
            if (records.length === 0) {
                return;
            }
            const now = Date.now();
            const tx = db.transaction((items: AgentSessionUsageRecord[]) => {
                const touched = new Map<
                    string,
                    { source: string; env: string; session_id: string }
                >();
                for (const r of items) {
                    upsert_record_stmt.run({
                        source: r.source,
                        env: r.env,
                        session_id: r.session_id,
                        title: r.title ?? null,
                        directory: r.directory ?? null,
                        slug: r.slug ?? null,
                        version: r.version ?? null,
                        parent_session_id: r.parent_session_id ?? null,
                        message_id: r.message_id,
                        role: r.role,
                        timestamp: r.timestamp,
                        model: r.model,
                        input_tokens: safe_int(r.input_tokens),
                        output_tokens: safe_int(r.output_tokens),
                        cache_read_tokens: safe_int(r.cache_read_tokens),
                        cache_write_tokens: safe_int(r.cache_write_tokens),
                        agent: r.agent,
                        updated_at: now,
                    });
                    touched.set(`${r.source}\u0000${r.env}\u0000${r.session_id}`, {
                        source: r.source,
                        env: r.env,
                        session_id: r.session_id,
                    });
                }
                for (const t of touched.values()) {
                    delete_hour_rollup_session_stmt.run(t);
                    rebuild_hour_rollup_session_stmt.run({ ...t, now });
                }
                bump_data_version_stmt.run();
            });
            tx(records);
            log.debug(`Upserted ${String(records.length)} per-message records`);
        },

        query_buckets(filters) {
            const conditions: string[] = [];
            const params: Record<string, unknown> = {};

            if (filters.source) {
                conditions.push("source = @source");
                params["source"] = filters.source;
            }
            if (filters.env) {
                conditions.push("env = @env");
                params["env"] = filters.env;
            }
            if (filters.from_date) {
                conditions.push("bucket_date >= @from_date");
                params["from_date"] = filters.from_date;
            }
            if (filters.to_date) {
                conditions.push("bucket_date <= @to_date");
                params["to_date"] = filters.to_date;
            }

            const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
            const sql = `SELECT * FROM token_stats_buckets ${where} ORDER BY bucket_date DESC`;
            const rows = db.prepare(sql).all(params) as Record<string, unknown>[];
            return rows.map(row_to_bucket);
        },

        query_sessions(filters) {
            const conditions: string[] = [];
            const params: Record<string, unknown> = {};

            if (filters.source) {
                conditions.push("source = @source");
                params["source"] = filters.source;
            }
            if (filters.env) {
                conditions.push("env = @env");
                params["env"] = filters.env;
            }
            if (filters.search) {
                conditions.push(
                    "(title LIKE @search OR directory LIKE @search OR model LIKE @search OR id LIKE @search)",
                );
                params["search"] = `%${filters.search}%`;
            }

            const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
            const limit = filters.limit ?? 100;
            const offset = filters.offset ?? 0;
            const sql = `SELECT * FROM token_stats_sessions ${where} ORDER BY ended_at DESC LIMIT @limit OFFSET @offset`;
            params["limit"] = limit;
            params["offset"] = offset;

            const rows = db.prepare(sql).all(params) as Record<string, unknown>[];
            return rows.map(row_to_session);
        },

        query_records(filters) {
            const conditions: string[] = [];
            const params: Record<string, unknown> = {};

            if (filters.agent) {
                conditions.push("agent = @agent");
                params["agent"] = filters.agent;
            }
            if (filters.env) {
                conditions.push("env = @env");
                params["env"] = filters.env;
            }
            if (filters.start !== undefined) {
                conditions.push("timestamp >= @start");
                params["start"] = filters.start;
            }
            if (filters.end !== undefined) {
                conditions.push("timestamp <= @end");
                params["end"] = filters.end;
            }

            const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
            const limit = filters.limit ?? DEFAULT_RECORDS_LIMIT;
            params["limit"] = limit;
            const sql = `SELECT session_id, title, directory, slug, version, parent_session_id, message_id, role, timestamp, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, agent FROM token_stats_records ${where} ORDER BY timestamp DESC, message_id ASC LIMIT @limit`;
            const rows = db.prepare(sql).all(params) as Record<string, unknown>[];
            return rows.map(row_to_record);
        },

        query_heatmap(filters) {
            const conditions: string[] = [];
            const params: Record<string, unknown> = {};

            if (filters.agent) {
                conditions.push("agent = @agent");
                params["agent"] = filters.agent;
            }
            if (filters.env) {
                conditions.push("env = @env");
                params["env"] = filters.env;
            }
            if (filters.model) {
                conditions.push("model = @model");
                params["model"] = filters.model;
            }
            if (filters.start !== undefined) {
                conditions.push("timestamp >= @start");
                params["start"] = filters.start;
            }
            if (filters.end !== undefined) {
                conditions.push("timestamp <= @end");
                params["end"] = filters.end;
            }

            const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
            // Weekday/hour are computed in UTC+8 (the panel's fixed timezone, no
            // DST). %w is 0=Sunday..6=Saturday; the renderer maps it Monday-first.
            const sql = `SELECT
                CAST(strftime('%w', timestamp/1000, 'unixepoch', '+8 hours') AS INTEGER) AS weekday,
                CAST(strftime('%H', timestamp/1000, 'unixepoch', '+8 hours') AS INTEGER) AS hour,
                COUNT(*) AS calls,
                COUNT(DISTINCT session_id) AS sessions,
                SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens
            FROM token_stats_records ${where}
            GROUP BY weekday, hour`;
            return db.prepare(sql).all(params) as TokenStatsHeatmapCell[];
        },

        query_hour_buckets(filters) {
            const conditions: string[] = [];
            const params: Record<string, unknown> = {};

            if (filters.agent) {
                conditions.push("agent = @agent");
                params["agent"] = filters.agent;
            }
            if (filters.env) {
                conditions.push("env = @env");
                params["env"] = filters.env;
            }
            if (filters.model) {
                conditions.push("model = @model");
                params["model"] = filters.model;
            }
            if (filters.start !== undefined) {
                conditions.push("timestamp >= @start");
                params["start"] = filters.start;
            }
            if (filters.end !== undefined) {
                conditions.push("timestamp <= @end");
                params["end"] = filters.end;
            }

            const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
            // Local (UTC+8, the panel's fixed timezone) whole-hour start as UTC
            // epoch: round the timestamp down to its containing local hour. This
            // matches the renderer's bucketize hour boundaries (s005).
            const sql = `SELECT
                (timestamp - ((timestamp + 28800000) % 3600000)) AS hour_start,
                model,
                COUNT(*) AS calls,
                COUNT(DISTINCT session_id) AS sessions,
                SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens
            FROM token_stats_records ${where}
            GROUP BY hour_start, model`;
            return db.prepare(sql).all(params) as TokenStatsHourBucket[];
        },

        query_range_rollup(filters) {
            const conditions: string[] = [];
            const params: Record<string, unknown> = {};

            if (filters.agent) {
                conditions.push("agent = @agent");
                params["agent"] = filters.agent;
            }
            if (filters.env) {
                conditions.push("env = @env");
                params["env"] = filters.env;
            }
            if (filters.model) {
                conditions.push("model = @model");
                params["model"] = filters.model;
            }
            // start/end are always bound (defaults: 0 / far-future) so the
            // title subquery below can reference @start/@end unconditionally:
            // window-local latest when the caller passes them, full-table
            // latest otherwise. The subquery mirrors the outer half-open
            // [start, end) window so rs[0].title-equivalent stays inside it.
            params["start"] = filters.start ?? 0;
            params["end"] = filters.end ?? Number.MAX_SAFE_INTEGER;
            if (filters.start !== undefined) {
                conditions.push("timestamp >= @start");
            }
            if (filters.end !== undefined) {
                conditions.push("timestamp < @end");
            }

            const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
            // Half-open `[start, end)` so the current and previous windows share
            // their boundary record with neither side — matching the renderer's
            // prevRangeRecords half-open `[start - width, start)` split (a
            // record at exactly `start` belongs to current, never to previous).
            // This diverges from query_records' closed `<= @end`, but the rollup
            // drives the 24h KPI/donut axes whose current window end is
            // `Date.now()` (ms-precision now); a record timestamp exactly equal
            // to that value is not observable, so the divergence has no visible
            // effect while keeping the current/previous boundary unambiguous.
            // title picks the window-local latest-timestamp row per group
            // (records' sessionRows reads ORDER BY timestamp DESC over
            // window-filtered rows, so rs[0].title is the window-local latest);
            // MAX(title) would drift on rename, and an unscoped subquery would
            // pick a title from outside the window.
            const sql = `SELECT
                source,
                model,
                directory,
                session_id,
                (SELECT title FROM token_stats_records t2
                    WHERE t2.session_id = token_stats_records.session_id
                      AND t2.source = token_stats_records.source
                      AND t2.env = token_stats_records.env
                      AND t2.timestamp >= @start
                      AND t2.timestamp < @end
                    ORDER BY t2.timestamp DESC LIMIT 1) AS title,
                COUNT(*) AS calls,
                SUM(input_tokens) AS input_tokens,
                SUM(output_tokens) AS output_tokens,
                SUM(cache_read_tokens) AS cache_read_tokens,
                SUM(cache_write_tokens) AS cache_write_tokens
            FROM token_stats_records ${where}
            GROUP BY source, model, directory, session_id`;
            return db.prepare(sql).all(params) as TokenStatsRollupRow[];
        },

        query_dashboard(query, status): TokenStatsDashboardDto {
            const on_sql = options.on_sql;
            const prepare = on_sql
                ? (sql: string) => {
                      on_sql(sql);
                      return db.prepare(sql);
                  }
                : (sql: string) => db.prepare(sql);
            const rollup_ready =
                (get_rollup_ready_stmt.get() as { hour_rollup_ready: number } | undefined)
                    ?.hour_rollup_ready === 1;
            const width = query.end - query.start;
            const start_version = (get_data_version_stmt.get() as { version: number }).version;

            // Materialize the current window once; every region derives from
            // the temp table (AC1). Records/rollup dual track collapses to a
            // single window source (p031).
            const current_source = rollup_ready
                ? dashboard_window_union_builder(query)(query.start, query.end)
                : dashboard_records_source(query, query.start, query.end);
            materialize_window_rows(prepare, current_source);
            materialize_session_meta(prepare, query, query.start, query.end);
            const current_rollup = read_rollup_from_window_rows(prepare, true);

            // Metric-agnostic chart source (t200): the renderer derives the
            // chart for any metric/xaxis from these bounded rows, so switching
            // display dims reuses the cached dashboard instead of refetching.
            // metric_buckets carry calls+tokens per (bucket, model); the
            // sessions time chart needs per (bucket, directory) DISTINCT
            // session counts, which cannot be summed from per-model rows (a
            // session spanning models within a bucket would double count).
            const bucket_expression =
                query.gran === "hour"
                    ? "hour_start"
                    : "hour_start - ((hour_start + 28800000) % 86400000)";
            const metric_buckets = prepare(
                `SELECT ${bucket_expression} AS hour_start, model,
                    SUM(calls) AS calls,
                    SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens
                 FROM window_rows
                 GROUP BY ${bucket_expression}, model`,
            ).all() as TokenStatsDashboardMetricBucket[];
            const session_buckets = prepare(
                `SELECT ${bucket_expression} AS hour_start,
                    COALESCE(directory, '(unknown)') AS directory,
                    COUNT(DISTINCT source || '|' || env || '|' || session_id) AS sessions
                 FROM window_rows
                 GROUP BY ${bucket_expression}, COALESCE(directory, '(unknown)')`,
            ).all() as TokenStatsDashboardSessionBucket[];
            const session_offset = query.session_offset ?? 0;
            const session_limit = query.session_limit ?? 100;
            const session_page = dashboard_session_page_from_meta(
                prepare,
                session_offset,
                session_limit,
            );
            const session_items = dashboard_session_items(session_page.rows, current_rollup);
            // Model options reflect the whole agent/platform/range window, not
            // the selected model — otherwise the dropdown collapses to one
            // option and the user cannot switch models directly (AC1). Kept as
            // a temp table so no region re-scans the base table (p027).
            const model_list = build_dashboard_conditions(
                { ...query, model: undefined },
                query.start,
                query.end,
            );
            prepare("DROP TABLE IF EXISTS window_models").run();
            prepare(
                `CREATE TEMP TABLE window_models AS
                    SELECT DISTINCT model FROM token_stats_records
                    WHERE ${model_list.conditions.join(" AND ")}`,
            ).run(model_list.params);
            const models = (
                prepare("SELECT model FROM window_models ORDER BY model").all() as {
                    model: string;
                }[]
            ).map((row) => row.model);
            const heatmap = prepare(
                `SELECT
                    CAST(strftime('%w', hour_start/1000, 'unixepoch', '+8 hours') AS INTEGER) AS weekday,
                    CAST(strftime('%H', hour_start/1000, 'unixepoch', '+8 hours') AS INTEGER) AS hour,
                    SUM(calls) AS calls,
                    COUNT(DISTINCT source || '|' || env || '|' || session_id) AS sessions,
                    SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens
                 FROM window_rows
                 GROUP BY weekday, hour`,
            ).all() as TokenStatsHeatmapCell[];

            // Previous window only feeds the summary delta (no session-axis
            // titles, no chart regions) — a second single materialization.
            const previous_source = rollup_ready
                ? dashboard_window_union_builder(query)(query.start - width, query.start)
                : dashboard_records_source(query, query.start - width, query.start);
            materialize_window_rows(prepare, previous_source);
            const previous_rollup = read_rollup_from_window_rows(prepare, false);

            const end_version = (get_data_version_stmt.get() as { version: number }).version;
            const queried_at = Date.now();
            return {
                query,
                current: dashboard_summary_from_rollup(current_rollup, query),
                previous: dashboard_summary_from_rollup(previous_rollup, query),
                chart_data: {
                    axis: dashboard_chart_axis(query.start, query.end, query.gran),
                    metric_buckets,
                    session_buckets,
                    rollup: current_rollup,
                },
                heatmap,
                models,
                sessions: {
                    items: session_items,
                    total: session_page.total,
                    has_more: session_page.total > session_offset + session_items.length,
                },
                status,
                // A committed data-version advance while this request was
                // aggregating means the response is already stale (AC3).
                freshness: { queried_at, stale: end_version > start_version },
                data_version: end_version,
            };
        },

        query_dashboard_sessions(
            query: TokenStatsDashboardSessionsQuery,
        ): TokenStatsDashboardSessionsDto {
            const on_sql = options.on_sql;
            const prepare = on_sql
                ? (sql: string) => {
                      on_sql(sql);
                      return db.prepare(sql);
                  }
                : (sql: string) => db.prepare(sql);
            const rollup_ready =
                (get_rollup_ready_stmt.get() as { hour_rollup_ready: number } | undefined)
                    ?.hour_rollup_ready === 1;
            const offset = query.session_offset ?? 0;
            const limit = query.session_limit ?? 100;
            const source = rollup_ready
                ? dashboard_window_union_builder(query)(query.start, query.end)
                : dashboard_records_source(query, query.start, query.end);
            materialize_window_rows(prepare, source);
            materialize_session_meta(prepare, query, query.start, query.end);
            const current_rollup = read_rollup_from_window_rows(prepare, true);
            const page = dashboard_session_page_from_meta(prepare, offset, limit);
            const items = dashboard_session_items(page.rows, current_rollup);
            return {
                items,
                total: page.total,
                has_more: page.total > offset + items.length,
            };
        },

        get_data_version(): number {
            const row = get_data_version_stmt.get() as { version: number } | undefined;
            return row?.version ?? 0;
        },

        is_hour_rollup_ready(): boolean {
            const row = get_rollup_ready_stmt.get() as { hour_rollup_ready: number } | undefined;
            return (row?.hour_rollup_ready ?? 0) === 1;
        },

        backfill_hour_rollup(): void {
            if (readonly) {
                throw new Error("Token stats store is read-only");
            }
            const now = Date.now();
            const tx = db.transaction(() => {
                delete_hour_rollup_all_stmt.run();
                backfill_hour_rollup_stmt.run({ now });
                mark_rollup_ready_stmt.run();
            });
            tx();
            log.debug("Rebuilt hour rollup from records and marked ready");
        },

        last_updated() {
            const row = db
                .prepare("SELECT MAX(updated_at) AS ts FROM token_stats_sessions")
                .get() as { ts: number | null };
            return row.ts;
        },

        close() {
            log.debug("Closing token stats store");
            db.close();
        },
    };
}
