import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
    extract_opencode,
    extract_opencode_first_user,
    extract_opencode_incremental,
} from "../../../../../src/main/core/session-history/opencode-extractor";

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

function new_db(file: string): Database.Database {
    return new Database(file, NATIVE_BINDING_PATH ? { nativeBinding: NATIVE_BINDING_PATH } : {});
}

interface Fixture {
    db_path: string;
    tmp_dir: string;
    session_id: string;
    user_part_rowid: number;
    assistant_text_rowid: number;
    user_time: number;
    assistant_time: number;
}

function build_fixture(dir: string): Fixture {
    const db_path = path.join(dir, "opencode.db");
    const db = new_db(db_path);
    db.exec(`
CREATE TABLE message (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    time_created INTEGER NOT NULL,
    time_updated INTEGER,
    data TEXT NOT NULL
);
CREATE TABLE part (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    time_created INTEGER NOT NULL,
    time_updated INTEGER,
    data TEXT NOT NULL
);
`);
    const session_id = "sess_abc";
    const user_msg_id = "msg_user_1";
    const assistant_msg_id = "msg_assistant_1";
    const user_time = 1700000000000;
    const assistant_time = 1700000001000;
    const insert_msg = db.prepare(
        "INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?,?,?,?,?)",
    );
    insert_msg.run(
        user_msg_id,
        session_id,
        user_time,
        user_time,
        JSON.stringify({ role: "user", content: "ignored" }),
    );
    insert_msg.run(
        assistant_msg_id,
        session_id,
        assistant_time,
        assistant_time,
        JSON.stringify({ role: "assistant", modelID: "claude-3" }),
    );
    const insert_part = db.prepare(
        "INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?,?,?,?,?,?)",
    );
    // user text part
    insert_part.run(
        "prt_u1",
        user_msg_id,
        session_id,
        user_time,
        user_time,
        JSON.stringify({ type: "text", text: "你好" }),
    );
    // assistant tool part — 必须过滤
    insert_part.run(
        "prt_a_tool",
        assistant_msg_id,
        session_id,
        assistant_time,
        assistant_time,
        JSON.stringify({ type: "tool", tool: "read_file" }),
    );
    // assistant text part
    insert_part.run(
        "prt_a_text",
        assistant_msg_id,
        session_id,
        assistant_time + 1,
        assistant_time + 1,
        JSON.stringify({ type: "text", text: "已读取" }),
    );

    const rowids = db
        .prepare(
            "SELECT id, rowid AS rowid FROM part WHERE id IN ('prt_u1','prt_a_text') ORDER BY rowid",
        )
        .all() as { id: string; rowid: number }[];
    db.close();

    return {
        db_path,
        tmp_dir: dir,
        session_id,
        user_part_rowid: (() => {
            const r = rowids[0];
            if (!r) throw new Error("missing user rowid");
            return r.rowid;
        })(),
        assistant_text_rowid: (() => {
            const r = rowids[1];
            if (!r) throw new Error("missing assistant rowid");
            return r.rowid;
        })(),
        user_time,
        assistant_time: assistant_time + 1,
    };
}

let fixture: Fixture;
let tmp_dir: string;

beforeEach(() => {
    tmp_dir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-extr-"));
    fixture = build_fixture(tmp_dir);
});

afterEach(() => {
    try {
        fs.rmSync(tmp_dir, { recursive: true, force: true });
    } catch {
        // best effort
    }
});

describe("opencode extractor (t209)", () => {
    it("只提取 user/assistant text part，过滤 tool part", () => {
        const { messages } = extract_opencode(fixture.db_path, fixture.session_id);
        expect(messages.map((m) => m.id)).toEqual(["prt_u1", "prt_a_text"]);
        expect(messages).toHaveLength(2);
    });

    it("role 从 message.data 关联正确", () => {
        const { messages } = extract_opencode(fixture.db_path, fixture.session_id);
        expect(messages[0]?.role).toBe("user");
        expect(messages[1]?.role).toBe("assistant");
    });

    it("timestamp 用 part.time_created 正确", () => {
        const { messages } = extract_opencode(fixture.db_path, fixture.session_id);
        const first = messages[0];
        const second = messages[1];
        expect(first?.timestamp).toBe(fixture.user_time);
        expect(second?.timestamp).toBe(fixture.assistant_time);
        if (!first || !second) throw new Error("expected two messages");
        expect(first.timestamp ?? 0).toBeLessThanOrEqual(second.timestamp ?? 0);
    });

    it("全量返回 sqlite_rowid 游标，max_rowid 为最大 part rowid", () => {
        const { cursor } = extract_opencode(fixture.db_path, fixture.session_id);
        expect(cursor?.kind).toBe("sqlite_rowid");
        if (cursor?.kind === "sqlite_rowid") {
            expect(cursor.max_rowid).toBe(fixture.assistant_text_rowid);
        }
    });

    it("增量：全量后用游标增量，无新数据返回空", () => {
        const full = extract_opencode(fixture.db_path, fixture.session_id);
        const inc = extract_opencode_incremental(fixture.db_path, fixture.session_id, full.cursor);
        expect(inc.messages).toEqual([]);
        expect(inc.cursor).toEqual(full.cursor);
    });

    it("增量：新增 part 后只返回新增", () => {
        const full = extract_opencode(fixture.db_path, fixture.session_id);
        // 追加一条 assistant text part
        const db = new_db(fixture.db_path);
        const t = fixture.assistant_time + 100;
        db.prepare(
            "INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?,?,?,?,?,?)",
        ).run(
            "prt_a_text2",
            "msg_assistant_1",
            fixture.session_id,
            t,
            t,
            JSON.stringify({ type: "text", text: "补充" }),
        );
        db.close();

        const inc = extract_opencode_incremental(fixture.db_path, fixture.session_id, full.cursor);
        expect(inc.messages.map((m) => m.id)).toEqual(["prt_a_text2"]);
        expect(inc.messages[0]?.text).toBe("补充");
        expect(inc.cursor?.kind).toBe("sqlite_rowid");
    });

    it("空库不抛，返回空消息与 null 游标", () => {
        const empty_dir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-empty-"));
        const empty_db = path.join(empty_dir, "opencode.db");
        try {
            const db = new_db(empty_db);
            db.exec(`
CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);
CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);
`);
            db.close();
            const result = extract_opencode(empty_db, "no_such_session");
            expect(result.messages).toEqual([]);
            expect(result.cursor).toBeNull();
        } finally {
            fs.rmSync(empty_dir, { recursive: true, force: true });
        }
    });

    it("db 文件不存在不抛", () => {
        const missing = path.join(tmp_dir, "nope.db");
        const result = extract_opencode(missing, fixture.session_id);
        expect(result.messages).toEqual([]);
        expect(result.cursor).toBeNull();
    });

    it("非法 part.data JSON 跳过", () => {
        const db = new_db(fixture.db_path);
        const t = fixture.assistant_time + 200;
        // 插入一条 data 非合法 JSON 的 text part（用 json_extract 命中 type=text 需要 data 是 JSON，
        // 因此这里改用一条 type 不匹配的非法 JSON 应被 SQL 过滤；另外构造一条 message.data 非法的行）
        db.prepare(
            "INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?,?,?,?,?,?)",
        ).run(
            "prt_bad_msg",
            "msg_assistant_1",
            fixture.session_id,
            t,
            t,
            JSON.stringify({ type: "text", text: "x" }),
        );
        // 把对应 message.data 改成非法 JSON，触发 row_to_message 跳过
        db.prepare("UPDATE message SET data = 'not-json' WHERE id = 'msg_assistant_1'").run();
        db.close();

        const { messages } = extract_opencode(fixture.db_path, fixture.session_id);
        // msg_assistant_1 关联的所有 part 因 message.data 解析失败被跳过
        expect(messages.map((m) => m.id)).toEqual(["prt_u1"]);
    });

    it("first_user：返回首条 user text part 的文本", () => {
        expect(extract_opencode_first_user(fixture.db_path, fixture.session_id)).toBe("你好");
    });

    it("first_user：跳过 assistant part 后返回首条 user 文本", () => {
        const db = new_db(fixture.db_path);
        // 在 user part 之前插入一条 assistant text part
        db.prepare(
            "INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?,?,?,?,?,?)",
        ).run(
            "prt_a_first",
            "msg_assistant_1",
            fixture.session_id,
            fixture.user_time - 1,
            fixture.user_time - 1,
            JSON.stringify({ type: "text", text: "先出现的助手" }),
        );
        db.close();
        expect(extract_opencode_first_user(fixture.db_path, fixture.session_id)).toBe("你好");
    });

    it("first_user：无 user message 时返回空串", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-first-none-"));
        const db_path = path.join(dir, "opencode.db");
        try {
            const db = new_db(db_path);
            db.exec(`
CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);
CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);
`);
            db.prepare(
                "INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?,?,?,?,?)",
            ).run("msg_a", "sess_none", 1, 1, JSON.stringify({ role: "assistant" }));
            db.prepare(
                "INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?,?,?,?,?,?)",
            ).run("prt_a", "msg_a", "sess_none", 1, 1, JSON.stringify({ type: "text", text: "只有助手" }));
            db.close();
            expect(extract_opencode_first_user(db_path, "sess_none")).toBe("");
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it("first_user：db 缺失时返回空串", () => {
        const missing = path.join(tmp_dir, "nope_first_user.db");
        expect(extract_opencode_first_user(missing, fixture.session_id)).toBe("");
    });
});
