import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
    AgentSessionUsageRecord,
    TokenStatsDailyUpsert,
    TokenStatsEnv,
    TokenStatsSessionUpsert,
} from "../../../shared/types/token-stats";
import { createLogger } from "../../../shared/lib/logger";

const log = createLogger("opencode-reader");

function native_binding_path(): string | undefined {
    const candidates = [
        path.resolve(
            __dirname,
            "..",
            "..",
            "node_modules",
            "better-sqlite3",
            "build",
            "Release",
            "better_sqlite3.node",
        ),
        path.resolve(
            process.cwd(),
            "node_modules",
            "better-sqlite3",
            "build",
            "Release",
            "better_sqlite3.node",
        ),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate));
}

const NATIVE_BINDING_PATH = native_binding_path();

const SESSION_QUERY = `
SELECT id,
       model,
       tokens_input,
       tokens_output,
       tokens_reasoning,
       tokens_cache_read,
       tokens_cache_write,
       title,
       directory,
       time_created,
       time_updated
FROM session
WHERE time_updated > ?
  AND tokens_input > 0
`;

const PARTS_QUERY = `
SELECT p.id,
       p.message_id,
       p.session_id,
       p.time_created,
       p.data,
       m.data AS message_data
FROM part p
JOIN message m ON m.id = p.message_id
WHERE json_extract(p.data, '$.type') = 'step-finish'
  AND p.session_id IN (SELECT value FROM json_each(?))
ORDER BY p.session_id, p.time_created, p.id
`;

export interface OpenCodeReadResult {
    sessions: TokenStatsSessionUpsert[];
    daily: TokenStatsDailyUpsert[];
    records: AgentSessionUsageRecord[];
}

interface SessionRow {
    id: string;
    model: string | null;
    tokens_input: number;
    tokens_output: number;
    tokens_reasoning: number | null;
    tokens_cache_read: number | null;
    tokens_cache_write: number | null;
    title: string | null;
    directory: string | null;
    time_created: number;
    time_updated: number;
}

interface MessageTokens {
    total?: number;
    input?: number;
    output?: number;
    reasoning?: number;
    cache?: { write?: number; read?: number };
}

/**
 * Extract model ID from OpenCode's model JSON field.
 * Returns null for null, malformed, or missing id.
 */
function extract_model_id(raw: string | null): string | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const id = parsed["id"];
        return typeof id === "string" && id !== "" ? id : null;
    } catch {
        return null;
    }
}

function num(v: unknown): number {
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

/** UTC calendar date (YYYY-MM-DD) — matches Claude Code /stats bucketing. */
function calendar_date_of(ts: number): string {
    const d = new Date(ts);
    const pad = (x: number) => String(x).padStart(2, "0");
    return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Copy the db (+ wal/shm companions) to a temp dir and return the copy path.
 * Fallback for sources that can't be opened directly — WSL UNC shares fail
 * with "database is locked" when opencode is running inside WSL.
 * Returns null when the copy itself fails.
 */
function copy_db_to_temp(db_path: string, env: TokenStatsEnv): string | null {
    try {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), `omni-usage-opencode-${env}-`));
        const copy = path.join(dir, "opencode.db");
        fs.copyFileSync(db_path, copy);
        for (const suffix of ["-wal", "-shm"]) {
            try {
                fs.copyFileSync(db_path + suffix, copy + suffix);
            } catch {
                // companion may not exist — fine
            }
        }
        return copy;
    } catch {
        return null;
    }
}

/**
 * Read OpenCode sessions + per-day usage from its SQLite database.
 * Opens in read-only mode — never writes to the source DB.
 * Falls back to reading a temp copy when the source is locked (WSL case).
 * Returns empty arrays if the db is missing or unreadable.
 *
 * Daily rows come from step-finish parts (tokens + time_created), joined to
 * assistant messages for model IDs; calls = valid step-finish part count.
 * Values are full recounts per changed session — the store REPLACEs them.
 */
export function read_opencode_sessions(
    db_path: string,
    env: TokenStatsEnv,
    max_updated: number,
): OpenCodeReadResult {
    const direct = query_sessions(db_path, env, max_updated);
    if (direct !== null) {
        return direct;
    }
    const copy_path = copy_db_to_temp(db_path, env);
    if (copy_path === null) {
        log.warn(`Failed to read opencode db (and copy fallback): ${db_path}`);
        return { sessions: [], daily: [], records: [] };
    }
    log.info(`Reading opencode db via temp copy: ${db_path}`);
    const via_copy = query_sessions(copy_path, env, max_updated);
    try {
        fs.rmSync(path.dirname(copy_path), { recursive: true, force: true });
    } catch {
        // best effort cleanup
    }
    return via_copy ?? { sessions: [], daily: [], records: [] };
}

/** Returns null when the db cannot be opened/queried at all. */
function query_sessions(
    db_path: string,
    env: TokenStatsEnv,
    max_updated: number,
): OpenCodeReadResult | null {
    let db: InstanceType<typeof Database> | undefined;
    try {
        db = new Database(db_path, {
            readonly: true,
            ...(NATIVE_BINDING_PATH ? { nativeBinding: NATIVE_BINDING_PATH } : {}),
        });

        const rows = (db.prepare(SESSION_QUERY).all(max_updated) as SessionRow[])
            .map((row) => ({ ...row, model_id: extract_model_id(row.model) }))
            .filter((row) => row.model_id !== null);

        if (rows.length === 0) {
            return { sessions: [], daily: [], records: [] };
        }

        const ids_json = JSON.stringify(rows.map((r) => r.id));
        const session_meta = new Map(
            rows.map((row) => [
                row.id,
                {
                    title: row.title,
                    directory: row.directory,
                    model_id: row.model_id,
                },
            ]),
        );

        // Step-finish parts → calls + per-day usage + per-call records
        const calls_by_session = new Map<string, number>();
        const daily_by_key = new Map<string, TokenStatsDailyUpsert>();
        const records: AgentSessionUsageRecord[] = [];
        let parts_ok = true;
        try {
            const part_rows = db.prepare(PARTS_QUERY).all(ids_json) as {
                id: string;
                message_id: string;
                session_id: string;
                time_created: number;
                data: string;
                message_data: string;
            }[];
            for (const part_row of part_rows) {
                let data: Record<string, unknown>;
                let message_data: Record<string, unknown>;
                try {
                    data = JSON.parse(part_row.data) as Record<string, unknown>;
                    message_data = JSON.parse(part_row.message_data) as Record<string, unknown>;
                } catch {
                    continue;
                }
                const tokens = data["tokens"] as MessageTokens | undefined;
                const model_id = message_data["modelID"];
                if (!tokens || typeof model_id !== "string") {
                    continue;
                }

                calls_by_session.set(
                    part_row.session_id,
                    (calls_by_session.get(part_row.session_id) ?? 0) + 1,
                );
                const date = calendar_date_of(part_row.time_created);
                const key = `${part_row.session_id}|${date}|${model_id}`;
                const entry = daily_by_key.get(key) ?? {
                    id: part_row.session_id,
                    source: "opencode",
                    env,
                    model: model_id,
                    date,
                    input_tokens: 0,
                    output_tokens: 0,
                    cache_read_tokens: 0,
                    cache_write_tokens: 0,
                    calls: 0,
                };
                entry.input_tokens += num(tokens.input);
                entry.output_tokens += num(tokens.output);
                entry.cache_read_tokens += num(tokens.cache?.read);
                entry.cache_write_tokens += num(tokens.cache?.write);
                entry.calls++;
                daily_by_key.set(key, entry);

                const meta = session_meta.get(part_row.session_id);
                records.push({
                    source: "opencode",
                    env,
                    agent: "opencode",
                    session_id: part_row.session_id,
                    title: meta?.title ?? null,
                    directory: meta?.directory ?? null,
                    slug: null,
                    version: null,
                    parent_session_id: null,
                    message_id: part_row.message_id,
                    role: "assistant",
                    timestamp: part_row.time_created,
                    model: model_id,
                    input_tokens: num(tokens.input),
                    output_tokens: num(tokens.output),
                    cache_read_tokens: num(tokens.cache?.read),
                    cache_write_tokens: num(tokens.cache?.write),
                });
            }
        } catch {
            // part/message table missing or schema differs — calls/daily = no info
            parts_ok = false;
            log.warn(`Could not read opencode parts in ${db_path}`);
        }

        const sessions: TokenStatsSessionUpsert[] = rows.map((row) => ({
            id: row.id,
            source: "opencode" as const,
            env,
            model: row.model_id,
            title: row.title,
            directory: row.directory,
            input_tokens: row.tokens_input,
            output_tokens: row.tokens_output,
            cache_read_tokens: row.tokens_cache_read ?? 0,
            cache_write_tokens: row.tokens_cache_write ?? 0,
            calls: parts_ok ? (calls_by_session.get(row.id) ?? 0) : null,
            started_at: row.time_created,
            ended_at: row.time_updated,
        }));

        return { sessions, daily: [...daily_by_key.values()], records };
    } catch (err) {
        log.debug(`opencode db not directly readable: ${db_path}`, err);
        return null;
    } finally {
        if (db) {
            try {
                db.close();
            } catch {
                // ignore close errors
            }
        }
    }
}
