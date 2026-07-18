import Database from "better-sqlite3";
import type {
    AgentSessionUsage,
    AgentSessionUsageRecord,
    TokenStatsBucket,
    TokenStatsDailyUpsert,
    TokenStatsSession,
    TokenStatsSessionUpsert,
} from "../../../shared/types/token-stats";
import { createLogger } from "../../../shared/lib/logger";

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
    query_records(filters: {
        agent?: "claude-code" | "opencode";
        start?: number;
        end?: number;
    }): AgentSessionUsage[];
    /** Latest session upsert time (ms epoch), null when store is empty. */
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
        agent: row["agent"] as "claude-code" | "opencode",
    };
}

function safe_int(v: unknown): number {
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
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
            if (filters.start !== undefined) {
                conditions.push("timestamp >= @start");
                params["start"] = filters.start;
            }
            if (filters.end !== undefined) {
                conditions.push("timestamp <= @end");
                params["end"] = filters.end;
            }

            const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
            const sql = `SELECT session_id, title, directory, slug, version, parent_session_id, message_id, role, timestamp, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, agent FROM token_stats_records ${where} ORDER BY timestamp DESC`;
            const rows = db.prepare(sql).all(params) as Record<string, unknown>[];
            return rows.map(row_to_record);
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
