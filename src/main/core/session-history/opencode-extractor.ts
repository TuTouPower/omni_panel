/**
 * opencode 会话历史消息提取器（t209）。
 *
 * 读 `~/.local/share/opencode/opencode.db`（SQLite）。裁剪规则（决策 2）：
 * 仅留 part.data.type === "text" 的 text 字段；role 从关联 message.data.role 取。
 * 时间用 part.time_created（ms epoch）。详见 s015 / d017。
 *
 * 增量：按 part 表 rowid（隐藏列）游标（见 ExtractCursor.sqlite_rowid）。
 * 只读打开 db（readonly: true），永不写入源库。
 */
import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import type { HistoryMessage, ExtractResult, ExtractCursor } from "./types";

/** better-sqlite3 原生 binding 路径，兼容打包与源码运行两种布局。 */
function native_binding_path(): string | undefined {
    const candidates = [
        path.resolve(
            __dirname,
            "..",
            "..",
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
    return candidates.find((c) => fs.existsSync(c));
}

const NATIVE_BINDING_PATH = native_binding_path();

function open_db(db_path: string): Database.Database {
    return new Database(db_path, {
        readonly: true,
        ...(NATIVE_BINDING_PATH ? { nativeBinding: NATIVE_BINDING_PATH } : {}),
    });
}

interface PartRow {
    rowid: number;
    id: string;
    time_created: number;
    data: string;
    message_data: string;
}

const TEXT_PARTS_QUERY = `
SELECT p.rowid AS rowid,
       p.id AS id,
       p.time_created AS time_created,
       p.data AS data,
       m.data AS message_data
FROM part p
JOIN message m ON m.id = p.message_id
WHERE p.session_id = ?
  AND json_extract(p.data, '$.type') = 'text'
ORDER BY p.rowid ASC
`;

const TEXT_PARTS_QUERY_INCREMENTAL = `
SELECT p.rowid AS rowid,
       p.id AS id,
       p.time_created AS time_created,
       p.data AS data,
       m.data AS message_data
FROM part p
JOIN message m ON m.id = p.message_id
WHERE p.session_id = ?
  AND p.rowid > ?
  AND json_extract(p.data, '$.type') = 'text'
ORDER BY p.rowid ASC
`;

function row_to_message(row: PartRow): HistoryMessage | null {
    let part_data: Record<string, unknown>;
    let message_data: Record<string, unknown>;
    try {
        part_data = JSON.parse(row.data) as Record<string, unknown>;
        message_data = JSON.parse(row.message_data) as Record<string, unknown>;
    } catch {
        return null;
    }
    const role = message_data["role"];
    if (role !== "user" && role !== "assistant") return null;
    const text = part_data["text"];
    if (typeof text !== "string" || text === "") return null;
    return {
        id: row.id,
        role,
        text,
        timestamp: typeof row.time_created === "number" ? row.time_created : null,
    };
}

function map_rows(rows: PartRow[]): HistoryMessage[] {
    const out: HistoryMessage[] = [];
    for (const row of rows) {
        const msg = row_to_message(row);
        if (msg) out.push(msg);
    }
    return out;
}

function max_rowid_of(rows: PartRow[]): number | null {
    let max = 0;
    for (const r of rows) {
        if (r.rowid > max) max = r.rowid;
    }
    return rows.length > 0 ? max : null;
}

/**
 * 全量提取某 session 的消息。空库/无数据返回空，不抛。
 * 非法 part.data JSON 跳过。
 */
export function extract_opencode(db_path: string, session_id: string): ExtractResult {
    let db: Database.Database | undefined;
    try {
        db = open_db(db_path);
        const rows = db.prepare(TEXT_PARTS_QUERY).all(session_id) as PartRow[];
        const messages = map_rows(rows);
        const max = max_rowid_of(rows);
        const cursor: ExtractCursor | null =
            max !== null ? { kind: "sqlite_rowid", max_rowid: max } : null;
        return { messages, cursor };
    } catch {
        return { messages: [], cursor: null };
    } finally {
        if (db) {
            try {
                db.close();
            } catch {
                // ignore
            }
        }
    }
}

/**
 * 增量提取：只取 rowid > cursor.max_rowid 的 text part。
 * cursor 类型不匹配时退化为全量。
 */
export function extract_opencode_incremental(
    db_path: string,
    session_id: string,
    cursor: ExtractCursor | null,
): ExtractResult {
    let db: Database.Database | undefined;
    try {
        db = open_db(db_path);
        let rows: PartRow[];
        if (cursor?.kind === "sqlite_rowid") {
            rows = db
                .prepare(TEXT_PARTS_QUERY_INCREMENTAL)
                .all(session_id, cursor.max_rowid) as PartRow[];
        } else {
            rows = db.prepare(TEXT_PARTS_QUERY).all(session_id) as PartRow[];
        }
        const messages = map_rows(rows);
        const prev_max = cursor?.kind === "sqlite_rowid" ? cursor.max_rowid : 0;
        const cur_max = Math.max(prev_max, max_rowid_of(rows) ?? prev_max);
        const next_cursor: ExtractCursor = {
            kind: "sqlite_rowid",
            max_rowid: cur_max,
        };
        return { messages, cursor: next_cursor };
    } catch {
        return { messages: [], cursor };
    } finally {
        if (db) {
            try {
                db.close();
            } catch {
                // ignore
            }
        }
    }
}
