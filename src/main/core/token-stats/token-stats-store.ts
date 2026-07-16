import Database from "better-sqlite3";
import type { TokenStatsBucket, TokenStatsSession } from "../../../shared/types/token-stats";
import { createLogger } from "../../../shared/lib/logger";

export interface TokenStatsStore {
    upsert_buckets(buckets: TokenStatsBucket[]): void;
    upsert_sessions(sessions: TokenStatsSession[]): void;
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

export function create_token_stats_store(db_path: string): TokenStatsStore {
    const log = createLogger("token-stats-store");
    const db = new Database(db_path);
    db.pragma("journal_mode = WAL");
    db.pragma("wal_autocheckpoint = 1000");
    db.pragma("busy_timeout = 5000");
    db.exec(INIT_SQL);
    log.debug(`Token stats store initialized: ${db_path}`);

    const upsert_bucket_stmt = db.prepare(`
        INSERT OR REPLACE INTO token_stats_buckets (
            source, env, bucket_date, model,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
            sessions, calls, updated_at
        ) VALUES (
            @source, @env, @bucket_date, @model,
            @input_tokens, @output_tokens, @cache_read_tokens, @cache_write_tokens,
            @sessions, @calls, @updated_at
        )
    `);

    const upsert_session_stmt = db.prepare(`
        INSERT OR REPLACE INTO token_stats_sessions (
            id, source, env, model, title, directory,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
            calls, started_at, ended_at, updated_at
        ) VALUES (
            @id, @source, @env, @model, @title, @directory,
            @input_tokens, @output_tokens, @cache_read_tokens, @cache_write_tokens,
            @calls, @started_at, @ended_at, @updated_at
        )
    `);

    return {
        upsert_buckets(buckets: TokenStatsBucket[]): void {
            const now = Date.now();
            const tx = db.transaction((items: TokenStatsBucket[]) => {
                for (const b of items) {
                    upsert_bucket_stmt.run({
                        source: b.source,
                        env: b.env,
                        bucket_date: b.bucket_date,
                        model: b.model,
                        input_tokens: b.input_tokens,
                        output_tokens: b.output_tokens,
                        cache_read_tokens: b.cache_read_tokens,
                        cache_write_tokens: b.cache_write_tokens,
                        sessions: b.sessions,
                        calls: b.calls,
                        updated_at: now,
                    });
                }
            });
            tx(buckets);
            log.debug(`Upserted ${String(buckets.length)} buckets`);
        },

        upsert_sessions(sessions: TokenStatsSession[]): void {
            const now = Date.now();
            const tx = db.transaction((items: TokenStatsSession[]) => {
                for (const s of items) {
                    upsert_session_stmt.run({
                        id: s.id,
                        source: s.source,
                        env: s.env,
                        model: s.model,
                        title: s.title ?? null,
                        directory: s.directory ?? null,
                        input_tokens: s.input_tokens,
                        output_tokens: s.output_tokens,
                        cache_read_tokens: s.cache_read_tokens,
                        cache_write_tokens: s.cache_write_tokens,
                        calls: s.calls,
                        started_at: s.started_at,
                        ended_at: s.ended_at,
                        updated_at: now,
                    });
                }
            });
            tx(sessions);
            log.debug(`Upserted ${String(sessions.length)} sessions`);
        },

        query_buckets(filters) {
            const conditions: string[] = [];
            const params: Record<string, unknown> = {};

            if (filters.source) {
                conditions.push("source = @source");
                params.source = filters.source;
            }
            if (filters.env) {
                conditions.push("env = @env");
                params.env = filters.env;
            }
            if (filters.from_date) {
                conditions.push("bucket_date >= @from_date");
                params.from_date = filters.from_date;
            }
            if (filters.to_date) {
                conditions.push("bucket_date <= @to_date");
                params.to_date = filters.to_date;
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
                params.source = filters.source;
            }
            if (filters.env) {
                conditions.push("env = @env");
                params.env = filters.env;
            }
            if (filters.search) {
                conditions.push("(title LIKE @search OR directory LIKE @search)");
                params.search = `%${filters.search}%`;
            }

            const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
            const limit = filters.limit ?? 100;
            const offset = filters.offset ?? 0;
            const sql = `SELECT * FROM token_stats_sessions ${where} ORDER BY ended_at DESC LIMIT @limit OFFSET @offset`;
            params.limit = limit;
            params.offset = offset;

            const rows = db.prepare(sql).all(params) as Record<string, unknown>[];
            return rows.map(row_to_session);
        },

        close() {
            log.debug("Closing token stats store");
            db.close();
        },
    };
}
