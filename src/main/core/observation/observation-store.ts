import Database from "better-sqlite3";
import type { Observation } from "../../../shared/types/observation";
import { createLogger, type Logger } from "../../../shared/lib/logger";

export interface ObservationStore {
    insert(obs: Observation): void;
    /** A31: 批量写入走单事务，返回写入成功与失败计数。 */
    insert_batch(observations: Observation[]): { ok: number; failed: number };
    get_latest(
        provider: string,
        account_id: string,
        metric_id: string,
        source_instance_id: string,
    ): Observation | null;
    list_latest_by_provider(provider: string): Observation[];
    list_all_providers(): string[];
    list_by_source_instance_id(source_instance_id: string): Observation[];
    /** A113 / AC-004: 查询指定实例每个指标的最新一条成功观测（stale=0），用于失败降级副本派生 */
    list_latest_success_by_instance?(source_instance_id: string): Observation[];
    /**
     * 取最近 `days` 天窗口内的趋势序列（t208 语义：固定桶数 `max_points`，
     * 默认 120 桶均分窗口、每桶取 observed_at 最大一条；原始点数 ≤ max_points
     * 时按实际点数，不聚合、不强制 null 填充）。返回升序序列，长度 ≤ max_points。
     *
     * `source_instance_id` 隔离：同一 (provider, account_id, metric_id) 下
     * 不同实例的观测各自分桶（t214——多账号 provider account_id 塌成同一值，
     * 真实身份压在 source_instance_id，旧版合并致 sparkline 串接）。
     * 索引：planner 选 idx_lookup(provider, account_id, metric_id,
     * source_instance_id, observed_at)——全覆盖 WHERE 等值列 + observed_at 范围，
     * 无需 filter（t221 删除冗余 idx_trend，旧库残留无害、不迁移 DROP）。
     */
    query_trend_series(
        provider: string,
        account_id: string,
        metric_id: string,
        source_instance_id: string,
        days: number,
        max_points?: number,
    ): Observation[];
    /** A34 / AC-006: 分批安全删除数据，默认每批 500 行，防数据库锁独占卡顿 */
    prune(older_than_ms: number, batch_size?: number): number;
    /** Total observation rows (test helper for asserting dedupe/prune row counts). */
    count_observations(): number;
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

-- A9 / AC-003: 实例查询复合索引，杜绝 list_by_source_instance_id 全表扫描
CREATE INDEX IF NOT EXISTS idx_by_instance
    ON observations(source_instance_id, account_id, metric_id, observed_at DESC, stale DESC);

-- t352 AC-003: 一次性数据清理（如 kimi:total_quota purge）的迁移批次标记。
-- migrate 以 INSERT OR IGNORE 取号，仅首次数次时执行对应清理。
CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    applied INTEGER NOT NULL DEFAULT 0
);
`;

const LABEL_COLUMNS = ["raw_label", "normalized_label", "display_label"] as const;

/** 迁移旧 schema：缺列则补（label 三列 + last_error）。幂等，逐列独立判断。 */
export function migrate_observation_schema(db: Database.Database, log: Logger): void {
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

    // A9 / AC-003: 迁移增加 idx_by_instance 复合索引
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_by_instance
            ON observations(source_instance_id, account_id, metric_id, observed_at DESC, stale DESC);
    `);

    // A38: Kimi purge 事务化
    db.exec(
        "CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, applied INTEGER NOT NULL DEFAULT 0)",
    );
    const purge_tx = db.transaction(() => {
        const mark = db
            .prepare("INSERT OR IGNORE INTO schema_meta (key) VALUES (?)")
            .run("kimi_total_quota_purge");
        if (mark.changes > 0) {
            const removed = db
                .prepare(
                    "DELETE FROM observations WHERE provider = 'kimi' AND metric_id = 'kimi:total_quota'",
                )
                .run();
            if (removed.changes > 0) {
                log.info(
                    `Observation store migrated: removed ${String(removed.changes)} stale kimi:total_quota rows`,
                );
            }
        }
    });
    purge_tx();
}

// A45: 读行数据安全检查，遇到畸变脏数据行过滤跳过并记录告警
function row_to_observation(row: Record<string, unknown>): Observation | null {
    if (
        typeof row["provider"] !== "string" ||
        !row["provider"] ||
        typeof row["source_instance_id"] !== "string" ||
        !row["source_instance_id"] ||
        typeof row["account_id"] !== "string" ||
        !row["account_id"] ||
        typeof row["metric_id"] !== "string" ||
        !row["metric_id"]
    ) {
        createLogger("observation-store").warn(
            "Corrupted observation row encountered in database, skipping",
            row,
        );
        return null;
    }
    const normalized =
        (row["normalized_label"] as string | undefined) ??
        (row["name"] as string | undefined) ??
        row["metric_id"];
    const display_label = row["display_label"] as string | undefined;
    const name = row["name"] as string | undefined;
    const obs: Observation = {
        provider: row["provider"],
        source_instance_id: row["source_instance_id"],
        account_id: row["account_id"],
        account_label: (row["account_label"] as string | undefined) ?? row["account_id"],
        metric_id: row["metric_id"],
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

    migrate_observation_schema(db, log);

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

    // t174 + t352 AC-002: 同键同 ts 的旧行在插入前清除，统一两种 stale 值——
    // stale 副本插入清旧 stale 副本（原观测保留），非 stale 插入清旧非 stale 行
    // （同 ts 重复去重，stale 副本保留）。消除同键同 ts 重复行，get_latest 结果确定。
    const delete_dup_stmt = db.prepare(`
        DELETE FROM observations
        WHERE provider = @provider AND source_instance_id = @source_instance_id
          AND account_id = @account_id AND metric_id = @metric_id
          AND observed_at = @observed_at AND stale = @stale
    `);

    // t352 AC-001: 单条写入（先清同键同 ts 旧行再插），供 insert 与
    // insert_batch 共用；事务内单条失败由 batch 侧捕获跳过。
    function insert_one(obs: Observation): void {
        delete_dup_stmt.run({
            provider: obs.provider,
            source_instance_id: obs.source_instance_id,
            account_id: obs.account_id,
            metric_id: obs.metric_id,
            observed_at: obs.observed_at,
            stale: obs.stale ? 1 : 0,
        });
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
    }

    // A31: 事务批量写入，统计成功与失败项
    const batch_tx = db.transaction(
        (observations: Observation[]): { ok: number; failed: number } => {
            let ok = 0;
            let failed = 0;
            for (const obs of observations) {
                try {
                    insert_one(obs);
                    ok++;
                } catch (err: unknown) {
                    failed++;
                    log.error(
                        `Failed to insert observation ${obs.provider}/${obs.account_id}/${obs.metric_id}: ${
                            err instanceof Error ? err.message : String(err)
                        }`,
                    );
                }
            }
            return { ok, failed };
        },
    );

    // A112: 显式列投影定义，避免 SELECT * 隐式泄露或开销
    const OBS_SELECT_COLUMNS = `
        provider, source_instance_id, account_id, account_label,
        metric_id, raw_label, normalized_label, display_label, name,
        window, used, "limit", display_style, reset_at, status,
        observed_at, source, stale, last_error
    `;

    // t174: stale 副本与原观测同 observed_at 时，stale DESC 让副本（stale=1）
    // 优先，latest 选择唯一确定（"已过期"标记优先于原始数据行）。
    const get_latest_stmt = db.prepare(`
        SELECT ${OBS_SELECT_COLUMNS} FROM observations
        WHERE provider = ? AND account_id = ? AND metric_id = ? AND source_instance_id = ?
        ORDER BY observed_at DESC, stale DESC LIMIT 1
    `);

    const list_latest_by_provider_stmt = db.prepare(`
        SELECT ${OBS_SELECT_COLUMNS} FROM (
            SELECT ${OBS_SELECT_COLUMNS}, ROW_NUMBER() OVER (
                PARTITION BY provider, account_id, metric_id, source_instance_id
                ORDER BY observed_at DESC, stale DESC
            ) AS rn
            FROM observations
            WHERE provider = ?
        )
        WHERE rn = 1
    `);

    const list_providers_stmt = db.prepare("SELECT DISTINCT provider FROM observations");

    // A9 / AC-003: 走 idx_by_instance 复合索引，消除全表扫描
    const list_by_instance_stmt = db.prepare(`
        SELECT ${OBS_SELECT_COLUMNS} FROM (
            SELECT ${OBS_SELECT_COLUMNS}, ROW_NUMBER() OVER (
                PARTITION BY account_id, metric_id
                ORDER BY observed_at DESC, stale DESC
            ) AS rn
            FROM observations
            WHERE source_instance_id = ?
        )
        WHERE rn = 1
    `);

    // A113 / AC-004: 仅查 stale=0 的最新成功观测，杜绝基于旧 stale 副本二次衍生
    const list_latest_success_by_instance_stmt = db.prepare(`
        SELECT ${OBS_SELECT_COLUMNS} FROM (
            SELECT ${OBS_SELECT_COLUMNS}, ROW_NUMBER() OVER (
                PARTITION BY account_id, metric_id
                ORDER BY observed_at DESC
            ) AS rn
            FROM observations
            WHERE source_instance_id = ? AND stale = 0
        )
        WHERE rn = 1
    `);

    // A34 / AC-006: 分批安全删除，每次删除最多 LIMIT 行，避免长时间独占数据库写锁
    const prune_batch_stmt = db.prepare(
        "DELETE FROM observations WHERE id IN (" +
            "SELECT id FROM observations WHERE observed_at < ? AND id NOT IN (" +
            "SELECT id FROM (" +
            "SELECT id, ROW_NUMBER() OVER (" +
            "PARTITION BY provider, account_id, metric_id, source_instance_id " +
            "ORDER BY observed_at DESC, stale DESC" +
            ") AS rn FROM observations" +
            ") WHERE rn = 1" +
            ") LIMIT ?" +
            ")",
    );

    // Sparkline: per-day latest observation within (now-days, now].
    // A33 / AC-005: 显式列投影与分桶下推
    const query_trend_stmt = db.prepare(`
        WITH bucketed AS (
            SELECT ${OBS_SELECT_COLUMNS},
                   CASE WHEN CAST((observed_at - ?) / ? AS INTEGER) >= ?
                        THEN ? - 1
                        ELSE CAST((observed_at - ?) / ? AS INTEGER)
                   END AS bucket_idx
            FROM observations
            WHERE provider = ? AND account_id = ? AND metric_id = ? AND source_instance_id = ?
              AND observed_at >= ?
        )
        SELECT ${OBS_SELECT_COLUMNS} FROM (
            SELECT ${OBS_SELECT_COLUMNS}, ROW_NUMBER() OVER (
                PARTITION BY bucket_idx ORDER BY observed_at DESC
            ) AS rn
            FROM bucketed
            WHERE bucket_idx >= 0
        )
        WHERE rn = 1
        ORDER BY observed_at ASC
        LIMIT ?
    `);

    return {
        insert(obs: Observation): void {
            insert_one(obs);
            log.debug(`Inserted observation: ${obs.provider}/${obs.account_id}/${obs.metric_id}`);
        },

        // A31: 批量写入单事务，返回写入成功与失败计数
        insert_batch(observations: Observation[]): { ok: number; failed: number } {
            if (observations.length === 0) return { ok: 0, failed: 0 };
            return batch_tx(observations);
        },

        get_latest(provider, account_id, metric_id, source_instance_id) {
            const row = get_latest_stmt.get(provider, account_id, metric_id, source_instance_id);
            return row ? row_to_observation(row as Record<string, unknown>) : null;
        },

        list_latest_by_provider(provider) {
            const rows = list_latest_by_provider_stmt.all(provider) as Record<string, unknown>[];
            return rows.map(row_to_observation).filter((o): o is Observation => o !== null);
        },

        list_all_providers() {
            const rows = list_providers_stmt.all() as { provider: string }[];
            return rows.map((r) => r.provider);
        },

        list_by_source_instance_id(source_instance_id: string) {
            const rows = list_by_instance_stmt.all(source_instance_id) as Record<string, unknown>[];
            return rows.map(row_to_observation).filter((o): o is Observation => o !== null);
        },

        list_latest_success_by_instance(source_instance_id: string) {
            const rows = list_latest_success_by_instance_stmt.all(source_instance_id) as Record<
                string,
                unknown
            >[];
            return rows.map(row_to_observation).filter((o): o is Observation => o !== null);
        },

        // A33 / AC-005: 限制 days <= 365, cap <= 1000，防止无界大查询
        query_trend_series(provider, account_id, metric_id, source_instance_id, days, max_points) {
            const clamped_days = Math.max(0, Math.min(days, 365));
            if (clamped_days <= 0) return [];
            const TREND_MAX_POINTS = 120;
            const target_cap = max_points && max_points > 0 ? max_points : TREND_MAX_POINTS;
            const clamped_cap = Math.max(1, Math.min(target_cap, 1000));
            const now = Date.now();
            const day_ms = 24 * 60 * 60 * 1000;
            const start_ms = now - clamped_days * day_ms;
            const bucket_width = (now - start_ms) / clamped_cap;
            const rows = query_trend_stmt.all(
                start_ms,
                bucket_width,
                clamped_cap,
                clamped_cap,
                start_ms,
                bucket_width,
                provider,
                account_id,
                metric_id,
                source_instance_id,
                start_ms,
                clamped_cap,
            ) as Record<string, unknown>[];
            return rows.map(row_to_observation).filter((o): o is Observation => o !== null);
        },

        prune(older_than_ms, batch_size = 500) {
            let total_pruned = 0;
            const limit = Math.max(1, batch_size);
            for (;;) {
                const result = prune_batch_stmt.run(older_than_ms, limit);
                total_pruned += result.changes;
                if (result.changes < limit) break;
            }
            if (total_pruned > 0) {
                log.debug(
                    `Pruned ${String(total_pruned)} observations older than ${String(older_than_ms)}ms in batches of ${String(limit)}`,
                );
            }
            return total_pruned;
        },

        count_observations() {
            const row = db.prepare("SELECT COUNT(*) AS n FROM observations").get() as {
                n: number;
            };
            return row.n;
        },

        close() {
            log.debug("Closing observation store");
            db.close();
        },
    };
}
