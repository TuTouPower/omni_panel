import Database from "better-sqlite3";
import type { Observation } from "../../../shared/types/observation";
import { createLogger } from "../../../shared/lib/logger";

export interface ObservationStore {
    insert(obs: Observation): void;
    get_latest(
        provider: string,
        account_id: string,
        metric_id: string,
        source_instance_id: string,
    ): Observation | null;
    list_latest_by_provider(provider: string): Observation[];
    list_all_providers(): string[];
    list_by_source_instance_id(source_instance_id: string): Observation[];
    prune(older_than_ms: number): number;
    close(): void;
}

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS observations (
    id INTEGER PRIMARY KEY,
    provider TEXT NOT NULL,
    source_instance_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    account_label TEXT NOT NULL,
    metric_id TEXT NOT NULL,
    raw_label TEXT NOT NULL,
    normalized_label TEXT NOT NULL,
    display_label TEXT,
    name TEXT,
    window TEXT NOT NULL,
    used REAL,
    "limit" REAL,
    display_style TEXT NOT NULL,
    reset_at INTEGER,
    status TEXT NOT NULL,
    observed_at INTEGER NOT NULL,
    source TEXT NOT NULL,
    stale INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_lookup
    ON observations(provider, account_id, metric_id, source_instance_id, observed_at);
`;

const MIGRATE_ADD_LABEL_COLUMNS_SQL = `
ALTER TABLE observations ADD COLUMN raw_label TEXT;
ALTER TABLE observations ADD COLUMN normalized_label TEXT;
ALTER TABLE observations ADD COLUMN display_label TEXT;
`;

function row_to_observation(row: Record<string, unknown>): Observation {
    const normalized =
        (row["normalized_label"] as string | undefined) ??
        (row["name"] as string | undefined) ??
        (row["metric_id"] as string | undefined) ??
        "";
    const display_label = row["display_label"] as string | undefined;
    const name = row["name"] as string | undefined;
    const obs: Observation = {
        provider: row["provider"] as string,
        source_instance_id: row["source_instance_id"] as string,
        account_id: row["account_id"] as string,
        account_label: row["account_label"] as string,
        metric_id: row["metric_id"] as string,
        raw_label: (row["raw_label"] as string | undefined) ?? normalized,
        normalized_label: normalized,
        ...(display_label !== undefined && { display_label }),
        ...(name !== undefined && { name }),
        window: row["window"] as Observation["window"],
        used: row["used"] as number | null,
        limit: row["limit"] as number | null,
        display_style: row["display_style"] as Observation["display_style"],
        reset_at: row["reset_at"] as number | null,
        status: row["status"] as Observation["status"],
        observed_at: row["observed_at"] as number,
        source: row["source"] as Observation["source"],
        stale: (row["stale"] as number) === 1,
        last_error: row["last_error"] as string | null,
    };
    return obs;
}

export function create_observation_store(db_path: string): ObservationStore {
    const log = createLogger("observation-store");
    const db = new Database(db_path);
    db.pragma("journal_mode = WAL");
    db.pragma("wal_autocheckpoint = 1000");
    // Bound write-lock contention: under WAL, concurrent writers will retry for
    // up to this many ms before throwing SQLITE_BUSY. Avoids indefinite waits
    // when another connection holds the write lock.
    db.pragma("busy_timeout = 5000");
    db.exec(INIT_SQL);
    log.debug(`Observation store initialized: ${db_path}`);

    // Migrate older databases that predate the raw/normalized/display label
    // columns. The columns are added without NOT NULL constraints so existing
    // rows survive; row_to_observation backfills missing values from `name`.
    const columns = db.prepare("PRAGMA table_info(observations)").all() as { name: string }[];
    const column_names = new Set(columns.map((c) => c.name));
    if (!column_names.has("raw_label")) {
        db.exec(MIGRATE_ADD_LABEL_COLUMNS_SQL);
        log.info(
            "Observation store migrated: added raw_label/normalized_label/display_label columns",
        );
    }

    const insert_stmt = db.prepare(`
        INSERT INTO observations (
            provider, source_instance_id, account_id, account_label,
            metric_id, raw_label, normalized_label, display_label, name,
            window, used, "limit", display_style,
            reset_at, status, observed_at, source, stale, last_error
        ) VALUES (
            @provider, @source_instance_id, @account_id, @account_label,
            @metric_id, @raw_label, @normalized_label, @display_label, @name,
            @window, @used, @limit, @display_style,
            @reset_at, @status, @observed_at, @source, @stale, @last_error
        )
    `);

    const get_latest_stmt = db.prepare(`
        SELECT * FROM observations
        WHERE provider = ? AND account_id = ? AND metric_id = ? AND source_instance_id = ?
        ORDER BY observed_at DESC LIMIT 1
    `);

    const list_latest_by_provider_stmt = db.prepare(`
        SELECT * FROM observations o1
        WHERE o1.provider = ?
        AND o1.observed_at = (
            SELECT MAX(o2.observed_at) FROM observations o2
            WHERE o2.provider = o1.provider
            AND o2.account_id = o1.account_id
            AND o2.metric_id = o1.metric_id
            AND o2.source_instance_id = o1.source_instance_id
        )
    `);

    const list_providers_stmt = db.prepare("SELECT DISTINCT provider FROM observations");

    const list_by_instance_stmt = db.prepare(`
        SELECT * FROM observations o1
        WHERE o1.source_instance_id = ?
        AND o1.observed_at = (
            SELECT MAX(o2.observed_at) FROM observations o2
            WHERE o2.source_instance_id = o1.source_instance_id
            AND o2.account_id = o1.account_id
            AND o2.metric_id = o1.metric_id
        )
    `);

    const prune_stmt = db.prepare(
        "DELETE FROM observations WHERE observed_at < ? AND id NOT IN (" +
            "SELECT id FROM observations o1 WHERE o1.observed_at = (" +
            "SELECT MAX(o2.observed_at) FROM observations o2 " +
            "WHERE o2.provider = o1.provider AND o2.account_id = o1.account_id " +
            "AND o2.metric_id = o1.metric_id AND o2.source_instance_id = o1.source_instance_id" +
            "))",
    );

    return {
        insert(obs: Observation): void {
            insert_stmt.run({
                provider: obs.provider,
                source_instance_id: obs.source_instance_id,
                account_id: obs.account_id,
                account_label: obs.account_label,
                metric_id: obs.metric_id,
                raw_label: obs.raw_label,
                normalized_label: obs.normalized_label,
                display_label: obs.display_label ?? null,
                name: obs.normalized_label,
                window: obs.window,
                used: obs.used,
                limit: obs.limit,
                display_style: obs.display_style,
                reset_at: obs.reset_at,
                status: obs.status,
                observed_at: obs.observed_at,
                source: obs.source,
                stale: obs.stale ? 1 : 0,
                last_error: obs.last_error,
            });
            log.debug(`Inserted observation: ${obs.provider}/${obs.account_id}/${obs.metric_id}`);
        },

        get_latest(provider, account_id, metric_id, source_instance_id) {
            const row = get_latest_stmt.get(provider, account_id, metric_id, source_instance_id);
            return row ? row_to_observation(row as Record<string, unknown>) : null;
        },

        list_latest_by_provider(provider) {
            const rows = list_latest_by_provider_stmt.all(provider) as Record<string, unknown>[];
            return rows.map(row_to_observation);
        },

        list_all_providers() {
            const rows = list_providers_stmt.all() as { provider: string }[];
            return rows.map((r) => r.provider);
        },

        list_by_source_instance_id(source_instance_id: string) {
            const rows = list_by_instance_stmt.all(source_instance_id) as Record<string, unknown>[];
            return rows.map(row_to_observation);
        },

        prune(older_than_ms) {
            const result = prune_stmt.run(older_than_ms);
            if (result.changes > 0) {
                log.debug(
                    `Pruned ${String(result.changes)} observations older than ${String(older_than_ms)}ms`,
                );
            }
            return result.changes;
        },

        close() {
            log.debug("Closing observation store");
            db.close();
        },
    };
}
