import Database from "better-sqlite3";
import type { Observation } from "../../../shared/types/observation";
import { createLogger, type Logger } from "../../../shared/lib/logger";

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
     * 取最近 `days` 天窗口内的趋势序列（t208 语义：固定桶数 `max_points`，
     * 默认 120 桶均分窗口、每桶取 observed_at 最大一条；原始点数 ≤ max_points
     * 时按实际点数，不聚合、不强制 null 填充）。返回升序序列，长度 ≤ max_points。
     *
     * `source_instance_id` 隔离：同一 (provider, account_id, metric_id) 下
     * 不同实例的观测各自分桶（t214——多账号 provider account_id 塌成同一值，
     * 真实身份压在 source_instance_id，旧版合并致 sparkline 串接）。
     * 索引：加 source_instance_id 后，planner 选 idx_lookup(provider, account_id,
     * metric_id, source_instance_id, observed_at)——全覆盖 WHERE 等值列 + observed_at
     * 范围，无需 filter；idx_trend 对本查询已冗余但保留（删属 schema 变更）。
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

-- Sparkline 趋势查询（t214 起 WHERE 含 source_instance_id）：planner 选 idx_lookup
-- （provider, account_id, metric_id, source_instance_id, observed_at）全覆盖。idx_trend
-- 保留供不含 source_instance_id 的等价查询路径；对当前 trend 查询 idx_lookup 已更优。
CREATE INDEX IF NOT EXISTS idx_trend
    ON observations(provider, account_id, metric_id, observed_at);
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

    // t174: stale 副本保留原观测的 observed_at。多次失败会对同一键插入
    // 同时间戳的副本，累积成行 + 让 latest 查询同 ts 多义。insert 前清掉
    // 同 (provider, account, metric, instance, observed_at) 的旧 stale 副本，
    // 使同键同 ts 至多一条副本（原观测保留）。
    const delete_stale_dup_stmt = db.prepare(`
        DELETE FROM observations
        WHERE provider = @provider AND source_instance_id = @source_instance_id
          AND account_id = @account_id AND metric_id = @metric_id
          AND observed_at = @observed_at AND stale = 1
    `);

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
    const query_trend_stmt = db.prepare(`
        SELECT * FROM observations
        WHERE provider = ? AND account_id = ? AND metric_id = ? AND source_instance_id = ? AND observed_at >= ?
        ORDER BY observed_at ASC
    `);

    return {
        insert(obs: Observation): void {
            // t174: 同键同 ts 的旧 stale 副本先清（见 delete_stale_dup_stmt）。
            if (obs.stale) {
                delete_stale_dup_stmt.run({
                    provider: obs.provider,
                    source_instance_id: obs.source_instance_id,
                    account_id: obs.account_id,
                    metric_id: obs.metric_id,
                    observed_at: obs.observed_at,
                });
            }
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

        query_trend_series(provider, account_id, metric_id, source_instance_id, days, max_points) {
            if (days <= 0) return [];
            const TREND_MAX_POINTS = 120;
            const cap = max_points && max_points > 0 ? max_points : TREND_MAX_POINTS;
            const now = Date.now();
            const day_ms = 24 * 60 * 60 * 1000;
            const start_ms = now - days * day_ms;
            const rows = query_trend_stmt.all(
                provider,
                account_id,
                metric_id,
                source_instance_id,
                start_ms,
            ) as Record<string, unknown>[];

            // t208: 取点策略。原始点数 ≤ cap 时每点独立（不聚合，保留采集粒度）；
            // 超过 cap 时按 cap 桶均分窗口、每桶取 observed_at 最大一条。
            const observations = rows.map(row_to_observation);
            if (observations.length === 0) return [];
            if (observations.length <= cap) {
                // 按 observed_at 升序。SQL ORDER BY observed_at ASC 下同 ts 的行
                // 顺序未定，后出现者覆盖（同 ts 保留最后一条）。
                const by_ts = new Map<number, Observation>();
                for (const obs of observations) {
                    by_ts.set(obs.observed_at, obs);
                }
                return [...by_ts.values()].sort((a, b) => a.observed_at - b.observed_at);
            }
            const span = now - start_ms;
            const bucket_width = span / cap;
            const buckets = new Map<number, Observation>();
            for (const obs of observations) {
                const idx = Math.min(
                    cap - 1,
                    Math.floor((obs.observed_at - start_ms) / bucket_width),
                );
                const prev = buckets.get(idx);
                if (!prev || obs.observed_at > prev.observed_at) {
                    buckets.set(idx, obs);
                }
            }
            // 升序返回（按 bucket index）。
            const result: Observation[] = [];
            for (let i = 0; i < cap; i++) {
                const obs = buckets.get(i);
                if (obs) result.push(obs);
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
