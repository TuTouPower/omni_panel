/**
 * antigravity 会话历史消息提取器（t455）。
 *
 * 读 `~/.gemini/antigravity-cli/conversations/<session_id>.db`（SQLite，
 * 每会话一库）。会话正文在 `steps` 表的 protobuf `step_payload` 内（d054）：
 * user 文本在 `step_type=14` 的 field19/sub2 明文；assistant 回复在
 * `step_type=15` 的 field20/sub1（sub8 同文复述、sub3 思考摘要、sub14
 * base64 块均丢弃）；`step_type=8` field14/sub4 为 tool 结果、`step_type=132`
 * field140 为内部动作消息，一律过滤。单步 unix 秒时间戳在 field5/sub1/sub1。
 *
 * HistoryMessage id 用 `antigravity:${steps.idx}`（行级稳定，全量/增量同一
 * 命名空间；opencode part id 同构）。增量按 idx 游标（sqlite_rowid 复用，
 * 语义为 max idx）。user 大信封在归一层处理（normalize_user_display_text），
 * 此处保留原文。
 */
import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import type { HistoryMessage, ExtractResult, ExtractCursor } from "./types";
import { normalize_user_display_text } from "./normalize_user_text";

/** better-sqlite3 原生 binding 路径，兼容打包与源码运行两种布局（opencode 同构）。 */
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

/** 最小 protobuf wire 读取（d054）：只支持 varint 与 LEN 子消息，不引新依赖。 */
interface ProtoField {
    readonly number: number;
    readonly varint?: number;
    readonly bytes?: Buffer;
}

function read_varint(buf: Buffer, pos: number): { value: number; next: number } | null {
    let result = 0;
    let shift = 0;
    let p = pos;
    while (p < buf.length) {
        const byte = buf[p] ?? 0;
        p += 1;
        result += (byte & 0x7f) * 2 ** shift;
        shift += 7;
        if ((byte & 0x80) === 0) {
            return { value: result, next: p };
        }
        if (shift > 56) return null;
    }
    return null;
}

function walk_fields(buf: Buffer): ProtoField[] {
    const fields: ProtoField[] = [];
    let pos = 0;
    while (pos < buf.length) {
        const key = read_varint(buf, pos);
        if (key === null) break;
        pos = key.next;
        const number = Math.floor(key.value / 8);
        const wire = key.value % 8;
        if (wire === 0) {
            const value = read_varint(buf, pos);
            if (value === null) break;
            pos = value.next;
            fields.push({ number, varint: value.value });
        } else if (wire === 2) {
            const length = read_varint(buf, pos);
            if (length === null) break;
            pos = length.next;
            fields.push({ number, bytes: buf.subarray(pos, pos + length.value) });
            pos += length.value;
        } else if (wire === 1) {
            pos += 8;
        } else if (wire === 5) {
            pos += 4;
        } else {
            break;
        }
    }
    return fields;
}

function first_bytes(fields: readonly ProtoField[], number: number): Buffer | null {
    for (const f of fields) {
        if (f.number === number && f.bytes !== undefined) return f.bytes;
    }
    return null;
}

function first_varint(fields: readonly ProtoField[], number: number): number | null {
    for (const f of fields) {
        if (f.number === number && f.varint !== undefined) return f.varint;
    }
    return null;
}

function utf8_text(buf: Buffer): string | null {
    if (buf.length === 0) return null;
    let text: string;
    try {
        text = buf.toString("utf-8");
    } catch {
        return null;
    }
    // 二进制子消息解码后多含替换字符，判为非文本。
    if (text.includes("�")) return null;
    return text === "" ? null : text;
}

/** field5/sub1/sub1 unix 秒 → ms；缺失或非法返回 null（grok 无时间先例）。 */
function step_timestamp_ms(payload: Buffer): number | null {
    const outer = first_bytes(walk_fields(payload), 5);
    if (outer === null) return null;
    const inner = first_bytes(walk_fields(outer), 1);
    if (inner === null) return null;
    const seconds = first_varint(walk_fields(inner), 1);
    if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null;
    return seconds * 1000;
}

interface StepRow {
    idx: number;
    step_type: number;
    step_payload: Buffer;
}

function row_to_message(row: StepRow): HistoryMessage | null {
    let text: string | null = null;
    let role: "user" | "assistant" | null = null;
    if (row.step_type === 14) {
        const body = first_bytes(walk_fields(row.step_payload), 19);
        const raw = body === null ? null : first_bytes(walk_fields(body), 2);
        const candidate = raw === null ? null : utf8_text(raw);
        if (candidate === null) return null;
        role = "user";
        text = candidate;
    } else if (row.step_type === 15) {
        const body = first_bytes(walk_fields(row.step_payload), 20);
        const raw = body === null ? null : first_bytes(walk_fields(body), 1);
        const candidate = raw === null ? null : utf8_text(raw);
        if (candidate === null) return null;
        role = "assistant";
        text = candidate;
    } else {
        return null;
    }
    let display_text = text;
    if (role === "user") {
        const norm = normalize_user_display_text(text);
        if (!norm.keep) return null;
        display_text = norm.text;
    }
    return {
        id: `antigravity:${String(row.idx)}`,
        role,
        text: display_text,
        timestamp: step_timestamp_ms(row.step_payload),
    };
}

function map_rows(rows: StepRow[]): HistoryMessage[] {
    const out: HistoryMessage[] = [];
    for (const row of rows) {
        const msg = row_to_message(row);
        if (msg) out.push(msg);
    }
    return out;
}

function max_idx_of(rows: StepRow[]): number | null {
    let max = 0;
    for (const r of rows) {
        if (r.idx > max) max = r.idx;
    }
    return rows.length > 0 ? max : null;
}

const STEPS_QUERY = `
SELECT idx AS idx, step_type AS step_type, step_payload AS step_payload
FROM steps
ORDER BY idx ASC
`;

const STEPS_QUERY_INCREMENTAL = `
SELECT idx AS idx, step_type AS step_type, step_payload AS step_payload
FROM steps
WHERE idx > ?
ORDER BY idx ASC
`;

const FIRST_USER_QUERY = `
SELECT idx AS idx, step_type AS step_type, step_payload AS step_payload
FROM steps
WHERE step_type = 14
ORDER BY idx ASC
LIMIT 200
`;

/**
 * 轻量扫描：按 idx 升序取前 200 个 user step，返回第一条可保留 user 文本；
 * 无 user 或 db 异常返回空串。不调用 extract_full。
 */ export function extract_antigravity_first_user(file: string): string {
    let db: Database.Database | undefined;
    try {
        db = open_db(file);
        const rows = db.prepare(FIRST_USER_QUERY).all() as StepRow[];
        for (const row of rows) {
            const msg = row_to_message(row);
            if (msg?.role === "user") {
                return msg.text;
            }
        }
        return "";
    } catch {
        return "";
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

/** 全量提取某会话库的消息。空库/无数据返回空，不抛。 */
export function extract_antigravity(file: string): ExtractResult {
    let db: Database.Database | undefined;
    try {
        db = open_db(file);
        const rows = db.prepare(STEPS_QUERY).all() as StepRow[];
        const messages = map_rows(rows);
        const max = max_idx_of(rows);
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

/** 增量提取：只取 idx > cursor.max_rowid 的 step。cursor 类型不匹配退化为全量。 */
export function extract_antigravity_incremental(
    file: string,
    cursor: ExtractCursor | null,
): ExtractResult {
    let db: Database.Database | undefined;
    try {
        db = open_db(file);
        let rows: StepRow[];
        if (cursor?.kind === "sqlite_rowid") {
            rows = db.prepare(STEPS_QUERY_INCREMENTAL).all(cursor.max_rowid) as StepRow[];
        } else {
            rows = db.prepare(STEPS_QUERY).all() as StepRow[];
        }
        const messages = map_rows(rows);
        const prev_max = cursor?.kind === "sqlite_rowid" ? cursor.max_rowid : 0;
        const cur_max = Math.max(prev_max, max_idx_of(rows) ?? prev_max);
        return { messages, cursor: { kind: "sqlite_rowid", max_rowid: cur_max } };
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

/**
 * 索引命中检查（locator 用）：conversation_summaries.db 是否含该会话 id。
 * db 缺失/表缺失/异常一律返回 false，调用方回退扫文件名。
 */
export function antigravity_index_has_session(summaries_db: string, session_id: string): boolean {
    let db: Database.Database | undefined;
    try {
        db = open_db(summaries_db);
        const row = db
            .prepare(
                "SELECT 1 AS hit FROM conversation_summaries WHERE conversation_id = ? LIMIT 1",
            )
            .get(session_id) as { hit: number } | undefined;
        return row !== undefined;
    } catch {
        return false;
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
