import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate_observation_schema } from "../../src/main/core/observation/observation-store";
import { createLogger } from "../../src/shared/lib/logger";

// 旧 schema：无 last_error（T028 前）
const OLD_SCHEMA = `
    CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY,
        provider TEXT NOT NULL,
        source_instance_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        account_label TEXT NOT NULL,
        metric_id TEXT NOT NULL,
        raw_label TEXT NOT NULL,
        normalized_label TEXT NOT NULL,
        display_style TEXT NOT NULL,
        status TEXT NOT NULL,
        observed_at INTEGER NOT NULL,
        source TEXT NOT NULL,
        stale INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_lookup
        ON observations(provider, account_id, metric_id, source_instance_id, observed_at);
`;

const log = createLogger("observation-store-migration-test");

describe("observation-store migration (last_error column)", () => {
    function has_column(db: Database.Database, col: string): boolean {
        const cols = db.prepare("PRAGMA table_info(observations)").all() as { name: string }[];
        return cols.some((c) => c.name === col);
    }

    it("migrates old schema by adding last_error column", () => {
        const db = new Database(":memory:");
        db.exec(OLD_SCHEMA);
        expect(has_column(db, "last_error")).toBe(false);
        // OLD_SCHEMA 已有 raw_label/normalized_label，仅缺 display_label 与 last_error
        expect(has_column(db, "display_label")).toBe(false);

        // 走生产迁移入口
        migrate_observation_schema(db, log);
        expect(has_column(db, "last_error")).toBe(true);
        expect(has_column(db, "display_label")).toBe(true);
        expect(has_column(db, "raw_label")).toBe(true);
        expect(has_column(db, "normalized_label")).toBe(true);

        // 迁移后 INSERT/SELECT last_error 成功
        db.prepare(
            `INSERT INTO observations (provider, source_instance_id, account_id, account_label,
                metric_id, raw_label, normalized_label, display_style, status, observed_at,
                source, stale, last_error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
            "claude",
            "inst1",
            "acc1",
            "test",
            "daily",
            "d",
            "d",
            "percent",
            "normal",
            0,
            "local",
            0,
            "err msg",
        );

        const row = db.prepare("SELECT last_error FROM observations WHERE id = 1").get() as {
            last_error: string;
        };
        expect(row.last_error).toBe("err msg");
        db.close();
    });

    it("migration is idempotent on new schema", () => {
        const db = new Database(":memory:");
        // 覆盖生产 INIT_SQL 的完整新 schema（含 last_error 与 label 三列）
        db.exec(`
            CREATE TABLE IF NOT EXISTS observations (
                id INTEGER PRIMARY KEY, provider TEXT NOT NULL,
                source_instance_id TEXT NOT NULL, account_id TEXT NOT NULL,
                account_label TEXT NOT NULL, metric_id TEXT NOT NULL,
                raw_label TEXT NOT NULL, normalized_label TEXT NOT NULL,
                display_label TEXT, name TEXT, window TEXT,
                display_style TEXT NOT NULL, status TEXT NOT NULL,
                observed_at INTEGER NOT NULL, source TEXT NOT NULL,
                stale INTEGER NOT NULL DEFAULT 0, last_error TEXT,
                used REAL, "limit" REAL, reset_at INTEGER
            );
        `);
        expect(has_column(db, "last_error")).toBe(true);
        expect(has_column(db, "display_label")).toBe(true);

        // 生产迁移入口幂等（列已存在，无 ALTER 错误）
        migrate_observation_schema(db, log);

        // INSERT/SELECT 正常
        db.prepare(
            `INSERT INTO observations (provider, source_instance_id, account_id, account_label,
                metric_id, raw_label, normalized_label, display_style, status, observed_at,
                source, stale, last_error, window)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
            "claude",
            "inst1",
            "acc1",
            "test",
            "daily",
            "d",
            "d",
            "percent",
            "normal",
            0,
            "local",
            0,
            null,
            "day",
        );

        const row = db.prepare("SELECT last_error FROM observations WHERE id = 1").get() as {
            last_error: string | null;
        };
        expect(row.last_error).toBeNull();
        db.close();
    });
});

describe("observation-store migration (stale metric cleanup)", () => {
    it("removes stale kimi:total_quota observations", () => {
        const db = new Database(":memory:");
        db.exec(`
            CREATE TABLE observations (
                id INTEGER PRIMARY KEY, provider TEXT NOT NULL,
                source_instance_id TEXT NOT NULL, account_id TEXT NOT NULL,
                account_label TEXT NOT NULL, metric_id TEXT NOT NULL,
                raw_label TEXT NOT NULL, normalized_label TEXT NOT NULL,
                display_label TEXT, name TEXT, window TEXT,
                display_style TEXT NOT NULL, status TEXT NOT NULL,
                observed_at INTEGER NOT NULL, source TEXT NOT NULL,
                stale INTEGER NOT NULL DEFAULT 0, last_error TEXT,
                used REAL, "limit" REAL, reset_at INTEGER
            );
            CREATE INDEX idx_lookup ON observations(provider, account_id, metric_id, source_instance_id, observed_at);
        `);

        const insert = db.prepare(`
            INSERT INTO observations (
                provider, source_instance_id, account_id, account_label,
                metric_id, raw_label, normalized_label, display_style, status,
                observed_at, source, stale
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        insert.run(
            "kimi",
            "inst1",
            "kimi",
            "Kimi",
            "kimi:total_quota",
            "total_quota",
            "总配额",
            "percent",
            "normal",
            1,
            "poll",
            0,
        );
        insert.run(
            "kimi",
            "inst1",
            "kimi",
            "Kimi",
            "kimi:weekly",
            "weekly",
            "一周",
            "percent",
            "normal",
            2,
            "poll",
            0,
        );
        insert.run(
            "claude",
            "inst2",
            "acc1",
            "Claude",
            "claude:daily",
            "daily",
            "今日",
            "percent",
            "normal",
            3,
            "poll",
            0,
        );

        migrate_observation_schema(db, log);

        const remaining = db.prepare("SELECT metric_id FROM observations ORDER BY id").all() as {
            metric_id: string;
        }[];
        expect(remaining.map((r) => r.metric_id)).toEqual(["kimi:weekly", "claude:daily"]);
        db.close();
    });

    it("is idempotent when no kimi:total_quota rows exist", () => {
        const db = new Database(":memory:");
        db.exec(`
            CREATE TABLE observations (
                id INTEGER PRIMARY KEY, provider TEXT NOT NULL,
                source_instance_id TEXT NOT NULL, account_id TEXT NOT NULL,
                account_label TEXT NOT NULL, metric_id TEXT NOT NULL,
                raw_label TEXT NOT NULL, normalized_label TEXT NOT NULL,
                display_label TEXT, name TEXT, window TEXT,
                display_style TEXT NOT NULL, status TEXT NOT NULL,
                observed_at INTEGER NOT NULL, source TEXT NOT NULL,
                stale INTEGER NOT NULL DEFAULT 0, last_error TEXT,
                used REAL, "limit" REAL, reset_at INTEGER
            );
            CREATE INDEX idx_lookup ON observations(provider, account_id, metric_id, source_instance_id, observed_at);
        `);

        db.prepare(
            `
            INSERT INTO observations (
                provider, source_instance_id, account_id, account_label,
                metric_id, raw_label, normalized_label, display_style, status,
                observed_at, source, stale
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        ).run(
            "kimi",
            "inst1",
            "kimi",
            "Kimi",
            "kimi:weekly",
            "weekly",
            "一周",
            "percent",
            "normal",
            1,
            "poll",
            0,
        );

        migrate_observation_schema(db, log);
        migrate_observation_schema(db, log);

        const remaining = db.prepare("SELECT metric_id FROM observations").all() as {
            metric_id: string;
        }[];
        expect(remaining.map((r) => r.metric_id)).toEqual(["kimi:weekly"]);
        db.close();
    });
});
