import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
    create_antigravity_scan_state,
    scan_antigravity_sessions,
} from "../../../../../src/main/core/token-stats/antigravity-reader";

function native_binding_path(): string | undefined {
    const candidates = [
        path.resolve(
            __dirname,
            "..",
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
const DB_OPTS = NATIVE_BINDING_PATH ? { nativeBinding: NATIVE_BINDING_PATH } : {};

const SID_INDEXED = "11111111-2222-4333-8444-555555555555";
const SID_FALLBACK = "66666666-7777-4888-8999-aaaaaaaaaaaa";
/** 真实形态：空格分隔 + 9 位小数 + 时区（s035 实测 `last_modified_time` 形态）。 */
const TS_REAL = "2026-09-07 17:03:29.173191751+00:00";
const TS_REAL_MS = Date.UTC(2026, 8, 7, 17, 3, 29, 173);
const MTIME_FIXED = new Date("2026-09-08T00:00:00.000Z");

interface SummaryRow {
    id: string;
    title: string;
    step_count: number;
    last_modified: string;
    workspace_uris: string;
}

function fixture_root(
    rows: SummaryRow[],
    fallback_steps: number,
): {
    dir: string;
    conv_dir: string;
    summaries_db: string;
} {
    const dir = mkdtempSync(join(tmpdir(), "agy-reader-t470-"));
    const conv_dir = join(dir, "conversations");
    mkdirSync(conv_dir, { recursive: true });
    const summaries_db = join(dir, "conversation_summaries.db");
    const summary = new Database(summaries_db, DB_OPTS);
    summary.exec(
        "CREATE TABLE conversation_summaries (conversation_id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', preview TEXT NOT NULL DEFAULT '', step_count INTEGER NOT NULL DEFAULT 0, last_modified_time TEXT NOT NULL, workspace_uris TEXT NOT NULL)",
    );
    const insert = summary.prepare(
        "INSERT INTO conversation_summaries (conversation_id, title, preview, step_count, last_modified_time, workspace_uris) VALUES (?, ?, '', ?, ?, ?)",
    );
    for (const r of rows) {
        insert.run(r.id, r.title, r.step_count, r.last_modified, r.workspace_uris);
    }
    summary.close();
    if (fallback_steps >= 0) {
        const db = new Database(join(conv_dir, `${SID_FALLBACK}.db`), DB_OPTS);
        db.exec("CREATE TABLE steps (idx INTEGER, step_type INTEGER, step_payload BLOB)");
        const put = db.prepare(
            "INSERT INTO steps (idx, step_type, step_payload) VALUES (?, 14, ?)",
        );
        for (let i = 0; i < fallback_steps; i++) {
            put.run(i, Buffer.alloc(0));
        }
        db.close();
        utimesSync(join(conv_dir, `${SID_FALLBACK}.db`), MTIME_FIXED, MTIME_FIXED);
    }
    return { dir, conv_dir, summaries_db };
}

const DIRS: string[] = [];
afterEach(() => {
    while (DIRS.length > 0) {
        const dir = DIRS.pop();
        if (dir) rmSync(dir, { recursive: true, force: true });
    }
});

function track(f: { dir: string }): { dir: string; conv_dir: string; summaries_db: string } {
    DIRS.push(f.dir);
    return f as { dir: string; conv_dir: string; summaries_db: string };
}

describe("antigravity reader (t470)", () => {
    it("AC-001: 索引行映射为会话 upsert（title/directory/calls/tokens 记 0/时间）", () => {
        const { conv_dir, summaries_db } = track(
            fixture_root(
                [
                    {
                        id: SID_INDEXED,
                        title: "  修一个 bug  ",
                        step_count: 42,
                        last_modified: TS_REAL,
                        workspace_uris: '["file:///home/u/proj"]',
                    },
                ],
                -1,
            ),
        );
        const result = scan_antigravity_sessions(
            conv_dir,
            summaries_db,
            "linux",
            create_antigravity_scan_state(),
        );
        expect(result.missing).toBe(false);
        expect(result.daily).toEqual([]);
        expect(result.records).toEqual([]);
        expect(result.sessions).toHaveLength(1);
        expect(result.sessions[0]).toMatchObject({
            id: SID_INDEXED,
            source: "antigravity",
            env: "linux",
            model: null,
            title: "修一个 bug",
            directory: "/home/u/proj",
            input_tokens: 0,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            calls: 42,
            started_at: TS_REAL_MS,
            ended_at: TS_REAL_MS,
        });
    });

    it("空 title 置 null，非 JSON workspace_uris 置 directory null", () => {
        const { conv_dir, summaries_db } = track(
            fixture_root(
                [
                    {
                        id: SID_INDEXED,
                        title: "",
                        step_count: 7,
                        last_modified: TS_REAL,
                        workspace_uris: "not-json",
                    },
                ],
                -1,
            ),
        );
        const result = scan_antigravity_sessions(
            conv_dir,
            summaries_db,
            "linux",
            create_antigravity_scan_state(),
        );
        expect(result.sessions[0]).toMatchObject({
            title: null,
            directory: null,
            calls: 7,
        });
    });

    it("零日期 last_modified 回退会话库文件 mtime", () => {
        const { conv_dir, summaries_db } = track(
            fixture_root(
                [
                    {
                        id: SID_INDEXED,
                        title: "t",
                        step_count: 3,
                        last_modified: "0001-01-01 00:00:00+00:00",
                        workspace_uris: "[]",
                    },
                ],
                -1,
            ),
        );
        // 索引命中但无时间：回退同名会话库 mtime；先造库并固定 mtime。
        const db = new Database(join(conv_dir, `${SID_INDEXED}.db`), DB_OPTS);
        db.exec("CREATE TABLE steps (idx INTEGER, step_type INTEGER, step_payload BLOB)");
        db.close();
        utimesSync(join(conv_dir, `${SID_INDEXED}.db`), MTIME_FIXED, MTIME_FIXED);
        const result = scan_antigravity_sessions(
            conv_dir,
            summaries_db,
            "linux",
            create_antigravity_scan_state(),
        );
        expect(result.sessions[0]).toMatchObject({
            started_at: MTIME_FIXED.getTime(),
            ended_at: MTIME_FIXED.getTime(),
        });
    });

    it("缺索引行回退扫文件名，calls 取 steps 行数，title 为 null", () => {
        const { conv_dir, summaries_db } = track(fixture_root([], 5));
        const result = scan_antigravity_sessions(
            conv_dir,
            summaries_db,
            "linux",
            create_antigravity_scan_state(),
        );
        expect(result.sessions).toHaveLength(1);
        expect(result.sessions[0]).toMatchObject({
            id: SID_FALLBACK,
            source: "antigravity",
            title: null,
            calls: 5,
            input_tokens: 0,
        });
    });

    it("会话目录缺失报 missing，不抛", () => {
        const dir = mkdtempSync(join(tmpdir(), "agy-reader-t470-"));
        DIRS.push(dir);
        const result = scan_antigravity_sessions(
            join(dir, "nope"),
            join(dir, "nope.db"),
            "linux",
            create_antigravity_scan_state(),
        );
        expect(result.missing).toBe(true);
        expect(result.sessions).toEqual([]);
    });

    it("增量：复扫无 sessions；索引 title 变更仅重发该会话", () => {
        const { summaries_db, conv_dir } = track(
            fixture_root(
                [
                    {
                        id: SID_INDEXED,
                        title: "v1",
                        step_count: 2,
                        last_modified: TS_REAL,
                        workspace_uris: "[]",
                    },
                ],
                4,
            ),
        );
        const first = scan_antigravity_sessions(
            conv_dir,
            summaries_db,
            "linux",
            create_antigravity_scan_state(),
        );
        expect(first.sessions).toHaveLength(2);
        const second = scan_antigravity_sessions(conv_dir, summaries_db, "linux", first.new_state);
        expect(second.sessions).toEqual([]);
        // 改 title 并显式推进 summaries mtime（同毫秒写盘不可靠）。
        const db = new Database(summaries_db, DB_OPTS);
        db.prepare("UPDATE conversation_summaries SET title = 'v2' WHERE conversation_id = ?").run(
            SID_INDEXED,
        );
        db.close();
        const later = new Date(MTIME_FIXED.getTime() + 60_000);
        utimesSync(summaries_db, later, later);
        const third = scan_antigravity_sessions(conv_dir, summaries_db, "linux", second.new_state);
        expect(third.sessions).toHaveLength(1);
        expect(third.sessions[0]).toMatchObject({ id: SID_INDEXED, title: "v2" });
    });

    it("summaries.db 缺失但目录在：回退仍出，missing 为 false", () => {
        const { conv_dir } = track(fixture_root([], 3));
        const result = scan_antigravity_sessions(
            conv_dir,
            join(conv_dir, "..", "gone.db"),
            "linux",
            create_antigravity_scan_state(),
        );
        expect(result.missing).toBe(false);
        expect(result.sessions).toHaveLength(1);
        expect(result.sessions[0]).toMatchObject({ id: SID_FALLBACK, calls: 3 });
    });

    it("summaries.db 损坏报 file_unreadable，仍回退目录", () => {
        const { conv_dir, summaries_db } = track(fixture_root([], 2));
        writeFileSync(summaries_db, "not a sqlite file");
        const result = scan_antigravity_sessions(
            conv_dir,
            summaries_db,
            "linux",
            create_antigravity_scan_state(),
        );
        expect(result.file_unreadable).toBe(true);
        expect(result.sessions).toHaveLength(1);
        expect(result.sessions[0]).toMatchObject({ id: SID_FALLBACK });
    });

    it("t470_code_f002: 空索引表合法，不报 file_unreadable", () => {
        const { conv_dir, summaries_db } = track(fixture_root([], 2));
        const result = scan_antigravity_sessions(
            conv_dir,
            summaries_db,
            "linux",
            create_antigravity_scan_state(),
        );
        expect(result.file_unreadable).toBe(false);
        expect(result.sessions).toHaveLength(1);
        expect(result.sessions[0]).toMatchObject({ id: SID_FALLBACK, calls: 2 });
    });

    it("t470_code_f001: summaries 未变时库 mtime 抖动不降级索引 facts", () => {
        const { conv_dir, summaries_db } = track(
            fixture_root(
                [
                    {
                        id: SID_INDEXED,
                        title: "索引标题",
                        step_count: 2,
                        last_modified: TS_REAL,
                        workspace_uris: '["file:///home/u/proj"]',
                    },
                ],
                -1,
            ),
        );
        const db = new Database(join(conv_dir, `${SID_INDEXED}.db`), DB_OPTS);
        db.exec("CREATE TABLE steps (idx INTEGER, step_type INTEGER, step_payload BLOB)");
        db.prepare("INSERT INTO steps VALUES (0, 14, ?)").run(Buffer.alloc(0));
        db.close();
        const first = scan_antigravity_sessions(
            conv_dir,
            summaries_db,
            "linux",
            create_antigravity_scan_state(),
        );
        expect(first.sessions).toHaveLength(1);
        // summaries 不动，仅触碰会话库 mtime。
        const later = new Date(MTIME_FIXED.getTime() + 120_000);
        utimesSync(join(conv_dir, `${SID_INDEXED}.db`), later, later);
        const second = scan_antigravity_sessions(conv_dir, summaries_db, "linux", first.new_state);
        expect(second.sessions).toEqual([]);
    });

    it("t470_code_f001: 无库索引行跨轮保留，mtime 空转不重发", () => {
        const { conv_dir, summaries_db } = track(
            fixture_root(
                [
                    {
                        id: SID_INDEXED,
                        title: "孤儿索引",
                        step_count: 9,
                        last_modified: TS_REAL,
                        workspace_uris: "[]",
                    },
                ],
                -1,
            ),
        );
        const first = scan_antigravity_sessions(
            conv_dir,
            summaries_db,
            "linux",
            create_antigravity_scan_state(),
        );
        expect(first.sessions).toHaveLength(1);
        const second = scan_antigravity_sessions(conv_dir, summaries_db, "linux", first.new_state);
        expect(second.sessions).toEqual([]);
        // 仅推进 summaries mtime 而不改内容：保留的 facts 相等，不重发。
        const later = new Date(MTIME_FIXED.getTime() + 180_000);
        utimesSync(summaries_db, later, later);
        const third = scan_antigravity_sessions(conv_dir, summaries_db, "linux", second.new_state);
        expect(third.sessions).toEqual([]);
    });
});
