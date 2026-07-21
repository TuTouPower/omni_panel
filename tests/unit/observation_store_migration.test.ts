import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

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

// 新 schema（含 last_error）
const NEW_COLUMN_SQL = `ALTER TABLE observations ADD COLUMN last_error TEXT`;

describe("observation-store migration (last_error column)", () => {
    function has_column(db: Database.Database, col: string): boolean {
        const cols = db.prepare("PRAGMA table_info(observations)").all() as { name: string }[];
        return cols.some((c) => c.name === col);
    }

    it("migrates old schema by adding last_error column", () => {
        const db = new Database(":memory:");
        db.exec(OLD_SCHEMA);
        expect(has_column(db, "last_error")).toBe(false);

        // 迁移：PRAGMA 检查 + ALTER TABLE
        if (!has_column(db, "last_error")) {
            db.exec(NEW_COLUMN_SQL);
        }
        expect(has_column(db, "last_error")).toBe(true);

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
        // 新 schema（含 last_error）
        db.exec(`
            CREATE TABLE IF NOT EXISTS observations (
                id INTEGER PRIMARY KEY, provider TEXT NOT NULL,
                source_instance_id TEXT NOT NULL, account_id TEXT NOT NULL,
                account_label TEXT NOT NULL, metric_id TEXT NOT NULL,
                raw_label TEXT NOT NULL, normalized_label TEXT NOT NULL,
                display_style TEXT NOT NULL, status TEXT NOT NULL,
                observed_at INTEGER NOT NULL, source TEXT NOT NULL,
                stale INTEGER NOT NULL DEFAULT 0, last_error TEXT
            );
        `);
        expect(has_column(db, "last_error")).toBe(true);

        // PRAGMA 检查后跳过 ALTER（列已存在）
        if (!has_column(db, "last_error")) {
            db.exec(NEW_COLUMN_SQL);
        }
        // ALTER 未执行，无 error

        // INSERT/SELECT 正常
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
            null,
        );

        const row = db.prepare("SELECT last_error FROM observations WHERE id = 1").get() as {
            last_error: string | null;
        };
        expect(row.last_error).toBeNull();
        db.close();
    });
});
