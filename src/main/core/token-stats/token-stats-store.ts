import Database from "better-sqlite3";
import type {
    AgentSessionUsage,
    AgentSessionUsageRecord,
    TokenStatsBucket,
    TokenStatsDailyUpsert,
    TokenStatsDashboardChart,
    TokenStatsDashboardDto,
    TokenStatsDashboardQuery,
    TokenStatsDashboardSummary,
    TokenStatsDashboardNamedValue,
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
    last_updated(): number | null;
    close(): void;
}

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
`;

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
        agent: row["agent"] as "claude-code" | "opencode" | "kimi-code",
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

function dashboard_chart_from_cells(
    labels: string[],
    bucket_starts: number[],
    cells: Map<string, number>[],
): TokenStatsDashboardChart {
    const totals = new Map<string, number>();
    for (const cell of cells) {
        for (const [key, value] of cell) totals.set(key, (totals.get(key) ?? 0) + value);
    }
    const top_keys = dashboard_named_values(totals)
        .slice(0, 5)
        .map(({ key }) => key);
    const top_set = new Set(top_keys);
    const series_names = totals.size > top_keys.length ? [...top_keys, "其他"] : top_keys;
    const other_details = cells.map((cell) =>
        [...cell.entries()]
            .filter(([key]) => !top_set.has(key))
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 20),
    );
    const series = series_names.map((name) => ({
        name,
        data: cells.map((cell) =>
            [...cell.entries()].reduce(
                (sum, [key, value]) =>
                    sum + ((name === "其他" ? !top_set.has(key) : key === name) ? value : 0),
                0,
            ),
        ),
    }));
    return { labels, bucket_starts, series, other_details };
}

function dashboard_chart_from_hour_buckets(
    buckets: TokenStatsHourBucket[],
    query: TokenStatsDashboardQuery,
): TokenStatsDashboardChart {
    const bucket_starts: number[] = [query.start];
    let boundary = dashboard_local_boundary(query.start, query.gran);
    while (boundary < query.end) {
        bucket_starts.push(boundary);
        boundary = dashboard_local_boundary(boundary, query.gran);
    }
    const labels = bucket_starts.map((start) => dashboard_label(start, query.gran));
    const cells = bucket_starts.map(() => new Map<string, number>());
    const index_of = (timestamp: number): number => {
        let low = 0;
        let high = bucket_starts.length;
        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if ((bucket_starts[mid] ?? query.start) <= timestamp) low = mid + 1;
            else high = mid;
        }
        return Math.max(0, low - 1);
    };
    const dir_resolver = dashboard_alias_resolver(query.dir_aliases);
    const model_resolver = dashboard_alias_resolver(query.model_aliases);
    for (const bucket of buckets) {
        const index = index_of(bucket.hour_start);
        const cell = cells[index];
        if (!cell) continue;
        const value =
            query.metric === "tokens"
                ? bucket.tokens
                : query.metric === "calls"
                  ? bucket.calls
                  : bucket.sessions;
        const key =
            query.metric === "sessions" ? dir_resolver(bucket.model) : model_resolver(bucket.model);
        cell.set(key, (cell.get(key) ?? 0) + value);
    }
    return dashboard_chart_from_cells(labels, bucket_starts, cells);
}

function dashboard_chart_from_rollup(
    rows: DashboardRollupRow[],
    query: TokenStatsDashboardQuery,
): TokenStatsDashboardChart {
    const value_of = (row: DashboardRollupRow): number =>
        query.metric === "tokens"
            ? row.input_tokens + row.output_tokens + row.cache_read_tokens + row.cache_write_tokens
            : query.metric === "calls"
              ? row.calls
              : 1;
    const directory_resolver = dashboard_alias_resolver(query.dir_aliases);
    const model_resolver = dashboard_alias_resolver(query.model_aliases);
    const session_key = (row: DashboardRollupRow): string =>
        `${row.source}|${row.env}|${row.session_id}`;
    const category_of = (row: DashboardRollupRow): string =>
        query.xaxis === "project"
            ? directory_resolver(row.directory ?? "(unknown)")
            : session_key(row);
    const category_totals = new Map<string, number>();
    const category_sessions = new Map<string, Set<string>>();
    for (const row of rows) {
        const category = category_of(row);
        if (query.metric === "sessions") {
            const sessions = category_sessions.get(category) ?? new Set<string>();
            sessions.add(session_key(row));
            category_sessions.set(category, sessions);
        } else {
            category_totals.set(category, (category_totals.get(category) ?? 0) + value_of(row));
        }
    }
    if (query.metric === "sessions") {
        for (const [category, sessions] of category_sessions) {
            category_totals.set(category, sessions.size);
        }
    }
    const ranked_categories = [...category_totals.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 20)
        .map(([category]) => category);
    const category_set = new Set(ranked_categories);
    const labels = ranked_categories.map((category) =>
        query.xaxis === "session"
            ? (rows.find((row) => category_of(row) === category)?.title ?? "")
            : category,
    );
    const cells = ranked_categories.map(() => new Map<string, number>());
    const session_cells = ranked_categories.map(() => new Map<string, Set<string>>());
    const other_index = ranked_categories.length < category_totals.size ? cells.length : -1;
    if (other_index >= 0) {
        labels.push("其他");
        cells.push(new Map());
        session_cells.push(new Map());
    }
    for (const row of rows) {
        const raw_category = category_of(row);
        const index = category_set.has(raw_category)
            ? ranked_categories.indexOf(raw_category)
            : other_index;
        if (index < 0) continue;
        const cell = cells[index];
        if (!cell) continue;
        const key =
            query.metric === "sessions"
                ? directory_resolver(row.directory ?? "(unknown)")
                : model_resolver(row.model);
        if (query.metric === "sessions") {
            const session_cell = session_cells[index];
            if (!session_cell) continue;
            const sessions = session_cell.get(key) ?? new Set<string>();
            sessions.add(session_key(row));
            session_cell.set(key, sessions);
        } else {
            cell.set(key, (cell.get(key) ?? 0) + value_of(row));
        }
    }
    if (query.metric === "sessions") {
        session_cells.forEach((session_cell, index) => {
            const cell = cells[index];
            if (!cell) return;
            for (const [key, sessions] of session_cell) cell.set(key, sessions.size);
        });
    }
    return dashboard_chart_from_cells(labels, [], cells);
}

export function create_token_stats_store(db_path: string): TokenStatsStore {
    const log = createLogger("token-stats-store");
    const db = new Database(db_path);
    db.pragma("journal_mode = WAL");
    db.pragma("wal_autocheckpoint = 1000");
    db.pragma("busy_timeout = 5000");
    db.exec(INIT_SQL);
    // Migration v2: (1) daily `date` switched from collector-local to UTC
    // bucketing — local-dated rows would linger next to UTC rows and
    // double-count; (2) sessions of deleted transcript files were kept
    // forever, inflating per-window session counts. Both are derived data:
    // wipe once, the collector's full rescan on startup repopulates them.
    if ((db.pragma("user_version", { simple: true }) as number) < 2) {
        db.exec(
            "DELETE FROM token_stats_daily; DELETE FROM token_stats_buckets; DELETE FROM token_stats_sessions;",
        );
        db.pragma("user_version = 2");
    }
    // Migration v3: add per-message records table. Records are fully
    // re-emitted by the collector on each rescan, so wipe legacy rows once.
    if ((db.pragma("user_version", { simple: true }) as number) < 3) {
        db.exec("DELETE FROM token_stats_records;");
        db.pragma("user_version = 3");
    }
    // Migration v4: add idx_records_env_ts so query_records' (env, timestamp)
    // range + ORDER BY timestamp DESC uses an index seek instead of a full
    // scan. CREATE INDEX IF NOT EXISTS is idempotent; INIT_SQL already creates
    // it on fresh DBs, this branch backfills existing installs.
    if ((db.pragma("user_version", { simple: true }) as number) < 4) {
        db.exec(
            "CREATE INDEX IF NOT EXISTS idx_records_env_ts ON token_stats_records(env, timestamp DESC);",
        );
        db.pragma("user_version = 4");
    }
    // Migration v5: add timestamp and session lookup indexes used by the
    // bounded dashboard aggregate queries on existing databases.
    if ((db.pragma("user_version", { simple: true }) as number) < 5) {
        db.exec(
            "CREATE INDEX IF NOT EXISTS idx_records_ts ON token_stats_records(timestamp);" +
                "CREATE INDEX IF NOT EXISTS idx_records_session_ts ON token_stats_records(source, env, session_id, timestamp DESC);",
        );
        db.pragma("user_version = 5");
    }
    log.debug(`Token stats store initialized: ${db_path}`);

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

    return {
        upsert_sessions(deltas: TokenStatsSessionUpsert[], daily: TokenStatsDailyUpsert[]): void {
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
            if (records.length === 0) {
                return;
            }
            const now = Date.now();
            const tx = db.transaction((items: AgentSessionUsageRecord[]) => {
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
                }
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
            const build_conditions = (start: number, end: number) => {
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
                return { conditions, params };
            };
            const width = query.end - query.start;
            const read_rollup = (start: number, end: number): DashboardRollupRow[] => {
                const rollup_conditions = ["timestamp >= @start", "timestamp < @end"];
                const rollup_params: Record<string, unknown> = { start, end };
                if (query.agent !== "all") {
                    rollup_conditions.push("agent = @agent");
                    rollup_params["agent"] = query.agent;
                }
                if (query.platform !== "all") {
                    rollup_conditions.push("env = @env");
                    rollup_params["env"] = query.platform;
                }
                const rows = db
                    .prepare(
                        `SELECT source, env, model, directory, session_id,
                            (SELECT title FROM token_stats_records t2
                                WHERE t2.session_id = token_stats_records.session_id
                                  AND t2.source = token_stats_records.source
                                  AND t2.env = token_stats_records.env
                                  AND t2.timestamp >= @start AND t2.timestamp < @end
                                ORDER BY t2.timestamp DESC LIMIT 1) AS title,
                            COUNT(*) AS calls,
                            SUM(input_tokens) AS input_tokens,
                            SUM(output_tokens) AS output_tokens,
                            SUM(cache_read_tokens) AS cache_read_tokens,
                            SUM(cache_write_tokens) AS cache_write_tokens
                         FROM token_stats_records
                         WHERE ${rollup_conditions.join(" AND ")}
                         GROUP BY source, env, model, directory, session_id`,
                    )
                    .all(rollup_params) as Record<string, unknown>[];
                return rows.map((row) => ({
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
                }));
            };
            const current_rollup = read_rollup(query.start, query.end);
            const previous_rollup = read_rollup(query.start - width, query.start);
            const { conditions, params } = build_conditions(query.start, query.end);
            const chart_dimension =
                query.metric === "sessions" ? "COALESCE(directory, '(unknown)')" : "model";
            const bucket_expression =
                query.gran === "hour"
                    ? "timestamp - ((timestamp + 28800000) % 3600000)"
                    : "timestamp - ((timestamp + 28800000) % 86400000)";
            const bucket_rows =
                query.xaxis === "time"
                    ? (db
                          .prepare(
                              `SELECT
                                  ${bucket_expression} AS hour_start,
                                  ${chart_dimension} AS model,
                                  COUNT(*) AS calls,
                                  COUNT(DISTINCT source || '|' || env || '|' || session_id) AS sessions,
                                  SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens
                               FROM token_stats_records
                               WHERE ${conditions.join(" AND ")}
                               GROUP BY hour_start, model`,
                          )
                          .all(params) as TokenStatsHourBucket[])
                    : [];
            const chart =
                query.xaxis === "time"
                    ? dashboard_chart_from_hour_buckets(bucket_rows, query)
                    : dashboard_chart_from_rollup(current_rollup, query);
            const session_count = db
                .prepare(
                    `SELECT COUNT(*) AS total FROM (
                        SELECT source, env, session_id FROM token_stats_records
                        WHERE ${conditions.join(" AND ")}
                        GROUP BY source, env, session_id
                    )`,
                )
                .get(params) as { total: number };
            const session_offset = query.session_offset ?? 0;
            const session_limit = query.session_limit ?? 100;
            const session_rows = db
                .prepare(
                    `SELECT source, env, session_id,
                        (SELECT title FROM token_stats_records t2
                            WHERE t2.source = token_stats_records.source
                              AND t2.env = token_stats_records.env
                              AND t2.session_id = token_stats_records.session_id
                              AND t2.timestamp >= @start AND t2.timestamp < @end
                            ORDER BY t2.timestamp DESC LIMIT 1) AS title,
                        (SELECT directory FROM token_stats_records t2
                            WHERE t2.source = token_stats_records.source
                              AND t2.env = token_stats_records.env
                              AND t2.session_id = token_stats_records.session_id
                              AND t2.timestamp >= @start AND t2.timestamp < @end
                            ORDER BY t2.timestamp DESC LIMIT 1) AS directory,
                        SUM(input_tokens) AS input_tokens,
                        SUM(output_tokens) AS output_tokens,
                        SUM(cache_read_tokens) AS cache_read_tokens,
                        SUM(cache_write_tokens) AS cache_write_tokens,
                        COUNT(*) AS calls, MIN(timestamp) AS started_at, MAX(timestamp) AS ended_at
                     FROM token_stats_records
                     WHERE ${conditions.join(" AND ")}
                     GROUP BY source, env, session_id
                     ORDER BY ended_at DESC, session_id ASC LIMIT @session_limit OFFSET @session_offset`,
                )
                .all({ ...params, session_limit, session_offset }) as Record<string, unknown>[];
            const model_map = new Map<string, Set<string>>();
            for (const row of current_rollup) {
                const key = `${row.source}|${row.env}|${row.session_id}`;
                const models = model_map.get(key) ?? new Set<string>();
                models.add(row.model);
                model_map.set(key, models);
            }
            const session_items = session_rows.map((row) => {
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
            const heatmap = db
                .prepare(
                    `SELECT
                        CAST(strftime('%w', timestamp/1000, 'unixepoch', '+8 hours') AS INTEGER) AS weekday,
                        CAST(strftime('%H', timestamp/1000, 'unixepoch', '+8 hours') AS INTEGER) AS hour,
                        COUNT(*) AS calls,
                        COUNT(DISTINCT source || '|' || env || '|' || session_id) AS sessions,
                        SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens
                     FROM token_stats_records
                     WHERE ${conditions.join(" AND ")}
                     GROUP BY weekday, hour`,
                )
                .all(params) as TokenStatsHeatmapCell[];
            const queried_at = Date.now();
            return {
                query,
                current: dashboard_summary_from_rollup(current_rollup, query),
                previous: dashboard_summary_from_rollup(previous_rollup, query),
                chart,
                heatmap,
                sessions: {
                    items: session_items,
                    total: session_count.total,
                    has_more: session_count.total > session_offset + session_items.length,
                },
                status,
                freshness: { queried_at, stale: false },
            };
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
