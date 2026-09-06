import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import {
    extract_antigravity,
    extract_antigravity_first_user,
    extract_antigravity_incremental,
} from "../../../../../src/main/core/session-history/antigravity-extractor";
import { resolve_session_file } from "../../../../../src/main/core/session-history/session-locator";

const SID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const TS_USER = 1784078548;
const TS_ASSISTANT = 1784078600;

function native_binding_path(): string | undefined {
    const candidates = [
        path.resolve(
            __dirname,
            "..",
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

/** 最小 protobuf 编码（d054 实测字段号）：varint + LEN 子消息。 */
function varint(value: number): Buffer {
    const out: number[] = [];
    let v = value;
    while (v > 0x7f) {
        out.push((v & 0x7f) | 0x80);
        v = Math.floor(v / 128);
    }
    out.push(v);
    return Buffer.from(out);
}

function len_field(field_no: number, payload: Buffer): Buffer {
    const len = varint(payload.length);
    return Buffer.concat([varint((field_no << 3) | 2), len, payload]);
}

function var_field(field_no: number, value: number): Buffer {
    return Buffer.concat([varint(field_no << 3), varint(value)]);
}

function ts_block(ts: number): Buffer {
    return len_field(5, len_field(1, var_field(1, ts)));
}

function step(step_type: number, body: Buffer, ts: number): Buffer {
    return Buffer.concat([var_field(1, step_type), var_field(4, 3), ts_block(ts), body]);
}

function user_step(text: string, ts: number): Buffer {
    return step(14, len_field(19, len_field(2, Buffer.from(text, "utf-8"))), ts);
}

function assistant_step(text: string, ts: number): Buffer {
    return step(15, len_field(20, len_field(1, Buffer.from(text, "utf-8"))), ts);
}

function tool_step(output: string, ts: number): Buffer {
    return step(
        8,
        len_field(
            14,
            Buffer.concat([
                len_field(1, Buffer.from("file:///home/karon/proj", "utf-8")),
                len_field(4, Buffer.from(output, "utf-8")),
            ]),
        ),
        ts,
    );
}

function fixture_db(dir: string, sid: string): string {
    const conv_dir = join(dir, ".gemini", "antigravity-cli", "conversations");
    mkdirSync(conv_dir, { recursive: true });
    const file = join(conv_dir, `${sid}.db`);
    const db = new Database(
        file,
        NATIVE_BINDING_PATH ? { nativeBinding: NATIVE_BINDING_PATH } : {},
    );
    db.exec(
        "CREATE TABLE trajectory_meta (trajectory_id TEXT, cascade_id TEXT, trajectory_type INTEGER, source INTEGER)",
    );
    db.exec(
        "CREATE TABLE steps (idx INTEGER, step_type INTEGER, status INTEGER, has_subtrajectory INTEGER, metadata BLOB, error_details BLOB, permissions BLOB, task_details BLOB, render_info BLOB, step_payload BLOB, step_format INTEGER)",
    );
    const insert = db.prepare(
        "INSERT INTO steps (idx, step_type, status, metadata, step_payload) VALUES (?, ?, 3, ?, ?)",
    );
    insert.run(0, 14, Buffer.alloc(0), user_step("hello antigravity", TS_USER));
    insert.run(1, 8, Buffer.alloc(0), tool_step("tool output blob", TS_USER + 1));
    insert.run(2, 15, Buffer.alloc(0), assistant_step("hi there", TS_ASSISTANT));
    db.close();
    const summary = new Database(
        join(dir, ".gemini", "antigravity-cli", "conversation_summaries.db"),
        NATIVE_BINDING_PATH ? { nativeBinding: NATIVE_BINDING_PATH } : {},
    );
    summary.exec(
        "CREATE TABLE conversation_summaries (conversation_id TEXT PRIMARY KEY, title TEXT, preview TEXT)",
    );
    summary
        .prepare("INSERT INTO conversation_summaries VALUES (?, ?, ?)")
        .run(sid, "", "hello antigravity");
    summary.close();
    return file;
}

describe("antigravity extractor (t455)", () => {
    it("AC-002: 全量只返回 user/assistant 文本，timestamp 为秒转毫秒", () => {
        const dir = mkdtempSync(join(tmpdir(), "antigravity-ext-t455-"));
        try {
            const file = fixture_db(dir, SID);
            const { messages } = extract_antigravity(file);
            expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
            expect(messages.map((m) => m.text)).toEqual(["hello antigravity", "hi there"]);
            expect(messages.map((m) => m.timestamp)).toEqual([TS_USER * 1000, TS_ASSISTANT * 1000]);
            expect(messages.map((m) => m.id)).toEqual(["antigravity:0", "antigravity:2"]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("AC-003: 追加 step 后增量只返回新增，id 命名空间一致", () => {
        const dir = mkdtempSync(join(tmpdir(), "antigravity-ext-t455-"));
        try {
            const file = fixture_db(dir, SID);
            const first = extract_antigravity(file);
            expect(first.cursor).not.toBeNull();
            const db = new Database(
                file,
                NATIVE_BINDING_PATH ? { nativeBinding: NATIVE_BINDING_PATH } : {},
            );
            db.prepare(
                "INSERT INTO steps (idx, step_type, status, metadata, step_payload) VALUES (?, ?, 3, ?, ?)",
            ).run(3, 15, Buffer.alloc(0), assistant_step("second", TS_ASSISTANT + 10));
            db.close();
            if (first.cursor === null) throw new Error("expected cursor");
            const inc = extract_antigravity_incremental(file, first.cursor);
            expect(inc.messages.map((m) => m.text)).toEqual(["second"]);
            expect(inc.messages.map((m) => m.id)).toEqual(["antigravity:3"]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("AC-002b: first_user 返回首条 user 文本", () => {
        const dir = mkdtempSync(join(tmpdir(), "antigravity-ext-t455-"));
        try {
            const file = fixture_db(dir, SID);
            expect(extract_antigravity_first_user(file)).toBe("hello antigravity");
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("AC-001/AC-004: locator 索引命中解析到 db 文件；不存在返回 null", () => {
        const dir = mkdtempSync(join(tmpdir(), "antigravity-ext-t455-"));
        try {
            fixture_db(dir, SID);
            const locator_input = {
                host: "linux" as const,
                homedir: dir,
                win_home: "",
                wsl_distro: "Ubuntu-22.04",
                wsl_user: "",
                index_dir: join(dir, "index"),
            };
            const found = resolve_session_file("antigravity", "linux", SID, locator_input);
            expect(found).not.toBeNull();
            expect(found?.extractor_kind).toBe("antigravity");
            expect(found?.file_path.endsWith(`${SID}.db`)).toBe(true);
            const missing = resolve_session_file(
                "antigravity",
                "linux",
                "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee",
                locator_input,
            );
            expect(missing).toBeNull();
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("AC-005: tool 输出行被过滤", () => {
        const dir = mkdtempSync(join(tmpdir(), "antigravity-ext-t455-"));
        try {
            const file = fixture_db(dir, SID);
            const { messages } = extract_antigravity(file);
            expect(messages.some((m) => m.text.includes("tool output blob"))).toBe(false);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
