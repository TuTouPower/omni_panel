import Database from "better-sqlite3";
import type { TokenStatsEnv, TokenStatsSession } from "../../../shared/types/token-stats";
import { createLogger } from "../../../shared/lib/logger";

const log = createLogger("opencode-reader");

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

/**
 * Read OpenCode sessions from its SQLite database.
 * Opens in read-only mode — never writes to the source DB.
 * Returns empty array if db is locked or missing (WSL case).
 */
export function read_opencode_sessions(
    db_path: string,
    env: TokenStatsEnv,
    max_updated: number,
): TokenStatsSession[] {
    let db: InstanceType<typeof Database> | undefined;
    try {
        db = new Database(db_path, { readonly: true });

        const rows = (db.prepare(SESSION_QUERY).all(max_updated) as SessionRow[])
            .map((row) => ({ ...row, model_id: extract_model_id(row.model) }))
            .filter((row) => row.model_id !== null);

        return rows.map((row) => ({
            id: row.id,
            source: "opencode" as const,
            env,
            model: row.model_id ?? "unknown",
            title: row.title,
            directory: row.directory,
            input_tokens: row.tokens_input,
            output_tokens: row.tokens_output,
            cache_read_tokens: row.tokens_cache_read ?? 0,
            cache_write_tokens: row.tokens_cache_write ?? 0,
            calls: 0,
            started_at: row.time_created,
            ended_at: row.time_updated,
        }));
    } catch (err) {
        log.warn(`Failed to read opencode db: ${db_path}`, err);
        return [];
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
