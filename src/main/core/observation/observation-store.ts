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
    /**
     * 取最近 `days` 天内、按天分桶的最新一条观测,每天最多 1 条。
     * 返回长度 = `days`,从最早到最新升序;缺失日期填 null。
     *
     * 使用 `idx_trend(provider, account_id, metric_id, observed_at)` 覆盖
     * 范围扫描;同一 (provider, account_id, metric_id) 下不同 source_instance_id
     * 的观测会合并到同一日期桶,取 observed_at 最大的一条。
     */
    query_trend_series(
        provider: string,
        account_id: string,
        metric_id: string,
        days: number,
    ): (Observation | null)[];
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

-- Sparkline 趋势查询:WHERE provider/account_id/metric_id + observed_at>=? 范围扫描。
-- idx_lookup 因 metric_id 后还挂 source_instance_id,在 observed_at 之前,无法覆盖此范围。
CREATE INDEX IF NOT EXISTS idx_trend
    ON observations(provider, account_id, metric_id, observed_at);
`;

const LABEL_COLUMNS = ["raw_label", "normalized_label", "display_label"] as const;

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
    // Check each column independently (A9) — a partially-applied migration
    // (raw_label added but normalized_label not) must still backfill the rest,
    // otherwise inserts binding @normalized_label fail.
    const columns = db.prepare("PRAGMA table_info(observations)").all() as { name: string }[];
    const column_names = new Set(columns.map((c) => c.name));
    const missing = LABEL_COLUMNS.filter((col) => !column_names.has(col));
    if (missing.length > 0) {
        for (const col of missing) {
            db.exec(`ALTER TABLE observations ADD COLUMN ${col} TEXT;`);
        }
        log.info(`Observation store migrated: added columns ${missing.join(", ")}`);
    }

    // Migrate pre-T028 databases that predate the last_error column.
    if (!column_names.has("last_error")) {
        db.exec("ALTER TABLE observations ADD COLUMN last_error TEXT;");
        log.info("Observation store migrated: added last_error column");
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

    // t096 perf: 旧写法用相关子查询（每行算 MAX），64k 行下 53s。
    // 改 window function 走 idx_lookup 覆盖索引，语义不变（每 (account_id, metric_id) 最新行），39ms。
    const list_by_instance_stmt = db.prepare(`
        SELECT * FROM (
            SELECT *, ROW_NUMBER() OVER (
                PARTITION BY account_id, metric_id
                ORDER BY observed_at DESC
            ) AS rn
            FROM observations
            WHERE source_instance_id = ?
        )
        WHERE rn = 1
    `);

    const prune_stmt = db.prepare(
        "DELETE FROM observations WHERE observed_at < ? AND id NOT IN (" +
            "SELECT id FROM observations o1 WHERE o1.observed_at = (" +
            "SELECT MAX(o2.observed_at) FROM observations o2 " +
            "WHERE o2.provider = o1.provider AND o2.account_id = o1.account_id " +
            "AND o2.metric_id = o1.metric_id AND o2.source_instance_id = o1.source_instance_id" +
            "))",
    );

    // Sparkline: per-day latest observation within (now-days, now].
    // Group by UTC day (observed_at / 86400000), keep max observed_at per day.
    const query_trend_stmt = db.prepare(`
        SELECT * FROM observations
        WHERE provider = ? AND account_id = ? AND metric_id = ? AND observed_at >= ?
        ORDER BY observed_at ASC
    `);

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

        query_trend_series(provider, account_id, metric_id, days) {
            if (days <= 0) return [];
            const now = Date.now();
            const day_ms = 24 * 60 * 60 * 1000;
            const start_ms = now - days * day_ms;
            const rows = query_trend_stmt.all(provider, account_id, metric_id, start_ms) as Record<
                string,
                unknown
            >[];

            // Bucket by UTC day, keep latest observed_at per day.
            // Map key: days-since-epoch (floor(observed_at / day_ms)).
            const daily = new Map<number, Observation>();
            for (const row of rows) {
                const obs = row_to_observation(row);
                const bucket = Math.floor(obs.observed_at / day_ms);
                const prev = daily.get(bucket);
                if (!prev || obs.observed_at > prev.observed_at) {
                    daily.set(bucket, obs);
                }
            }

            // Build series: days points ending at today's UTC bucket, ascending.
            const today_bucket = Math.floor(now / day_ms);
            const result: (Observation | null)[] = [];
            for (let i = days - 1; i >= 0; i--) {
                const bucket = today_bucket - i;
                result.push(daily.get(bucket) ?? null);
            }
            return result;
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
