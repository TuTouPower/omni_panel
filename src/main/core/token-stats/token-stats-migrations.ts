import type Database from "better-sqlite3";
import { legacy_env_from_directory } from "./token-stats-env";
import { ROLLUP_INIT_SQL, INIT_SQL } from "./token-stats-schema";

export function host_default_env(): "win" | "mac" | "linux" {
    if (process.platform === "win32") return "win";
    if (process.platform === "darwin") return "mac";
    return "linux";
}

type LegacyRow = Record<string, unknown>;

export function migrate_legacy_table(
    db: Database.Database,
    table: string,
    options: {
        pk: readonly string[];
        classify: (row: LegacyRow) => "win" | "mac" | "linux";
        token_cols: readonly string[];
        started_at_col?: string;
        ended_at_col?: string;
    },
): void {
    const rows = db
        .prepare(`SELECT * FROM ${table} WHERE env IN ('local','win')`)
        .all() as LegacyRow[];
    if (rows.length === 0) return;

    const merged = new Map<string, LegacyRow>();
    for (const row of rows) {
        const target_env = options.classify(row);
        const key = options.pk
            .map((col) =>
                col === "env" ? target_env : typeof row[col] === "string" ? row[col] : "",
            )
            .join("\u0000");
        const existing = merged.get(key);
        if (existing === undefined) {
            merged.set(key, { ...row, env: target_env });
            continue;
        }
        for (const col of options.token_cols) {
            existing[col] = Math.max(Number(existing[col] ?? 0), Number(row[col] ?? 0));
        }
        if (options.started_at_col) {
            existing[options.started_at_col] = Math.min(
                Number(existing[options.started_at_col] ?? Number.MAX_SAFE_INTEGER),
                Number(row[options.started_at_col] ?? Number.MAX_SAFE_INTEGER),
            );
        }
        if (options.ended_at_col) {
            existing[options.ended_at_col] = Math.max(
                Number(existing[options.ended_at_col] ?? 0),
                Number(row[options.ended_at_col] ?? 0),
            );
        }
        for (const [col, value] of Object.entries(row)) {
            existing[col] ??= value;
        }
        existing["updated_at"] = Math.max(
            Number(existing["updated_at"] ?? 0),
            Number(row["updated_at"] ?? 0),
        );
    }

    const columns = Object.keys(merged.values().next().value ?? {});
    if (columns.length === 0) return;
    const insert = db.prepare(
        `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    );
    db.prepare(`DELETE FROM ${table} WHERE env IN ('local','win')`).run();
    for (const row of merged.values()) {
        insert.run(columns.map((col) => row[col]));
    }
}

export function migrate_legacy_envs(
    db: Database.Database,
    host_default: "win" | "mac" | "linux" = host_default_env(),
): void {
    const classify_dir = (directory: string | null): "win" | "mac" | "linux" =>
        legacy_env_from_directory(directory, host_default);

    const session_dirs = new Map<string, string | null>();
    for (const row of db
        .prepare(
            "SELECT id, source, directory FROM token_stats_sessions WHERE env IN ('local','win')",
        )
        .all() as { id: string; source: string; directory: string | null }[]) {
        const key = `${row.id}|${row.source}`;
        if (!session_dirs.has(key)) session_dirs.set(key, row.directory);
    }

    migrate_legacy_table(db, "token_stats_daily", {
        pk: ["id", "source", "env", "date", "model"],
        classify: (row) =>
            classify_dir(session_dirs.get(`${String(row["id"])}|${String(row["source"])}`) ?? null),
        token_cols: [
            "input_tokens",
            "output_tokens",
            "cache_read_tokens",
            "cache_write_tokens",
            "calls",
        ],
    });
    migrate_legacy_table(db, "token_stats_sessions", {
        pk: ["id", "source", "env"],
        classify: (row) => classify_dir(row["directory"] as string | null),
        token_cols: [
            "input_tokens",
            "output_tokens",
            "cache_read_tokens",
            "cache_write_tokens",
            "calls",
        ],
        started_at_col: "started_at",
        ended_at_col: "ended_at",
    });
    migrate_legacy_table(db, "token_stats_records", {
        pk: ["message_id", "source", "env"],
        classify: (row) => classify_dir(row["directory"] as string | null),
        token_cols: ["input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens"],
    });
}

const DELETE_BUCKETS_SQL = `DELETE FROM token_stats_buckets`;

const INSERT_BUCKETS_SQL = `
INSERT INTO token_stats_buckets (
    source, env, bucket_date, model,
    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
    sessions, calls, updated_at
)
SELECT source,
       env,
       date AS bucket_date,
       model,
       SUM(input_tokens),
       SUM(output_tokens),
       SUM(cache_read_tokens),
       SUM(cache_write_tokens),
       COUNT(DISTINCT id),
       SUM(calls),
       @now
FROM token_stats_daily
GROUP BY source, env, date, model;
`;

export function run_schema_and_migrations(db: Database.Database): void {
    db.exec(INIT_SQL);

    const version_row = db.prepare("PRAGMA user_version").get() as { user_version: number };
    const current_version = version_row.user_version;

    if (current_version < 2) {
        db.exec(
            "DELETE FROM token_stats_daily; DELETE FROM token_stats_buckets; DELETE FROM token_stats_sessions;",
        );
        db.pragma("user_version = 2");
    }
    if (current_version < 3) {
        db.exec("DELETE FROM token_stats_records;");
        db.pragma("user_version = 3");
    }
    if (current_version < 4) {
        db.exec(
            "CREATE INDEX IF NOT EXISTS idx_records_env_ts ON token_stats_records(env, timestamp DESC);",
        );
        db.pragma("user_version = 4");
    }
    if (current_version < 5) {
        db.exec(
            "CREATE INDEX IF NOT EXISTS idx_records_ts ON token_stats_records(timestamp);" +
                "CREATE INDEX IF NOT EXISTS idx_records_session_ts ON token_stats_records(source, env, session_id, timestamp DESC);",
        );
        db.pragma("user_version = 5");
    }
    if (current_version < 6) {
        db.exec(ROLLUP_INIT_SQL);
        db.pragma("user_version = 6");
    }
    if (current_version < 7) {
        db.exec(
            "UPDATE token_stats_records SET env='local' WHERE env='win';" +
                "UPDATE token_stats_sessions SET env='local' WHERE env='win';" +
                "UPDATE token_stats_daily SET env='local' WHERE env='win';" +
                "UPDATE token_stats_buckets SET env='local' WHERE env='win';" +
                "UPDATE token_stats_hour_rollup SET env='local' WHERE env='win';",
        );
        db.pragma("user_version = 7");
    }
    if (current_version < 8) {
        db.transaction(() => {
            migrate_legacy_envs(db, host_default_env());
            db.prepare(DELETE_BUCKETS_SQL).run();
            db.prepare(INSERT_BUCKETS_SQL).run({ now: Date.now() });
            db.prepare("DELETE FROM token_stats_hour_rollup").run();
            db.prepare("UPDATE token_stats_meta SET hour_rollup_ready = 0 WHERE id = 1").run();
            db.pragma("user_version = 8");
        })();
    }
}
