import Database from "better-sqlite3";
import type { Observation } from "../../../shared/types/observation";
import { createLogger, type Logger } from "../../../shared/lib/logger";

export interface ObservationStore {
    insert(obs: Observation): void;
    /** t352 AC-001: 批量写入走单事务，单条失败跳过并记日志（refresh 轮调用）。 */
    insert_batch(observations: Observation[]): void;
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
    prune(older_than_ms: number): number;
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

    // 清理已下线的 Kimi 总配额观测。connector 在 a03e38d4 已停止产出
    // kimi:total_quota；本地库中的 stale 行会导致用量面板继续显示"总配额 0"。
    // t352 AC-003: 一次性清理按迁移批次标记执行——首次打开取号执行，此后
    // INSERT OR IGNORE 不产生新行即跳过，不再每次打开重复 DELETE。
    db.exec(
        "CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, applied INTEGER NOT NULL DEFAULT 0)",
    );
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
}

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

    const batch_tx = db.transaction((observations: Observation[]) => {
        for (const obs of observations) {
            try {
                insert_one(obs);
            } catch (err: unknown) {
                // 坏条目跳过并记 per-obs 错误日志，不中断整批事务（t352 回退策略）。
                log.error(
                    `Failed to insert observation ${obs.provider}/${obs.account_id}/${obs.metric_id}: ${
                        err instanceof Error ? err.message : String(err)
                    }`,
                );
            }
        }
    });

    // t174: stale 副本与原观测同 observed_at 时，stale DESC 让副本（stale=1）
    // 优先，latest 选择唯一确定（"已过期"标记优先于原始数据行）。
    const get_latest_stmt = db.prepare(`
        SELECT * FROM observations
        WHERE provider = ? AND account_id = ? AND metric_id = ? AND source_instance_id = ?
        ORDER BY observed_at DESC, stale DESC LIMIT 1
    `);

    const list_latest_by_provider_stmt = db.prepare(`
        SELECT * FROM (
            SELECT *, ROW_NUMBER() OVER (
                PARTITION BY provider, account_id, metric_id, source_instance_id
                ORDER BY observed_at DESC, stale DESC
            ) AS rn
            FROM observations
            WHERE provider = ?
        )
        WHERE rn = 1
    `);

    const list_providers_stmt = db.prepare("SELECT DISTINCT provider FROM observations");

    // t096 perf: 旧写法用相关子查询（每行算 MAX），64k 行下 53s。
    // 改 window function 走 idx_lookup 覆盖索引，语义不变（每 (account_id, metric_id) 最新行），39ms。
    const list_by_instance_stmt = db.prepare(`
        SELECT * FROM (
            SELECT *, ROW_NUMBER() OVER (
                PARTITION BY account_id, metric_id
                ORDER BY observed_at DESC, stale DESC
            ) AS rn
            FROM observations
            WHERE source_instance_id = ?
        )
        WHERE rn = 1
    `);

    // t186: prune 保留每键最新一行（observed_at DESC, stale DESC），与 latest
    // 查询的 tie-breaker 一致。旧版用 MAX(o2.observed_at) 子查询，同 ts 下原观测
    // 与 stale 副本都命中「最新」保护，该键行不收敛（p016）。改 ROW_NUMBER 选每键
    // 唯一保留行后，删 observed_at < older_than 的其余行（含同 ts 冗余原观测）。
    const prune_stmt = db.prepare(
        "DELETE FROM observations WHERE observed_at < ? AND id NOT IN (" +
            "SELECT id FROM (" +
            "SELECT id, ROW_NUMBER() OVER (" +
            "PARTITION BY provider, account_id, metric_id, source_instance_id " +
            "ORDER BY observed_at DESC, stale DESC" +
            ") AS rn FROM observations" +
            ") WHERE rn = 1" +
            ")",
    );

    // Sparkline: per-day latest observation within (now-days, now].
    // t214: 加 source_instance_id 过滤，隔离多账号 provider（account_id 塌成同一值时）。
    // t351 AC-001: 分桶下推 SQL——按 cap 桶均分窗口、每桶 ROW_NUMBER 取
    // observed_at 最新一条，LIMIT cap，避免全窗口物化后 JS 分桶。bucket_idx
    // 用 CASE 钳制到 cap-1（对齐原 JS 的 Math.min(cap-1, ...)）。
    // 注意 CAST((observed_at-?)/? AS INTEGER)：better-sqlite3 把 number 一律
    // 绑成 REAL，不做 CAST 时 bucket_idx 为浮点（如 3.7），PARTITION BY 每点
    // 独立分区、聚合失效，整窗按 ASC LIMIT 返回最旧 cap 行（p?/F1 回归）。截断
    // 对非负值等同 Math.floor，语义对齐原 JS 分桶。
    const query_trend_stmt = db.prepare(`
        WITH bucketed AS (
            SELECT *,
                   CASE WHEN CAST((observed_at - ?) / ? AS INTEGER) >= ?
                        THEN ? - 1
                        ELSE CAST((observed_at - ?) / ? AS INTEGER)
                   END AS bucket_idx
            FROM observations
            WHERE provider = ? AND account_id = ? AND metric_id = ? AND source_instance_id = ?
              AND observed_at >= ?
        )
        SELECT * FROM (
            SELECT *, ROW_NUMBER() OVER (
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

        // t352 AC-001: refresh 一轮观测批量写入走单事务，替代逐条 autocommit。
        // 事务内单条失败记 per-obs 错误日志并跳过，不拖垮整批；整批原子提交。
        insert_batch(observations: Observation[]): void {
            if (observations.length === 0) return;
            batch_tx(observations);
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

        query_trend_series(provider, account_id, metric_id, source_instance_id, days, max_points) {
            if (days <= 0) return [];
            const TREND_MAX_POINTS = 120;
            const cap = max_points && max_points > 0 ? max_points : TREND_MAX_POINTS;
            const now = Date.now();
            const day_ms = 24 * 60 * 60 * 1000;
            const start_ms = now - days * day_ms;
            const bucket_width = (now - start_ms) / cap;
            // t351 AC-001: 分桶下推 SQL——每桶取最新一条，LIMIT cap 兜底，
            // 返回行数 ≤ cap，避免全窗口物化后 JS 分桶。
            const rows = query_trend_stmt.all(
                start_ms,
                bucket_width,
                cap,
                cap,
                start_ms,
                bucket_width,
                provider,
                account_id,
                metric_id,
                source_instance_id,
                start_ms,
                cap,
            ) as Record<string, unknown>[];
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
