import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import {
    mkdtempSync,
    rmSync,
    appendFileSync,
    writeFileSync,
    readdirSync,
    readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import {
    SessionHistorySubscriptionService,
    type SessionRow,
} from "../../../../../src/main/core/session-history/subscription-service";
import type { HistoryMessage } from "../../../../../src/main/core/session-history/types";

/**
 * t210 订阅服务集成测试。优先测轮询策略（grok/kimi）规避 fs.watch 的平台 flaky。
 * fixture 临时目录写 JSONL，追加后用真实短间隔轮询（30ms）触发，断言增量推送。
 */

function make_jsonl_line(
    type: "user" | "assistant",
    text: string,
    uuid: string,
    timestamp: string,
): string {
    return JSON.stringify({
        type,
        uuid,
        message: { role: type, content: [{ type: "text", text }] },
        timestamp,
    });
}

/** 轮询触发断言：重复检查 predicate 直到通过或超时（默认 10s，放宽 p051 整批负载）。 */
async function wait_for(
    predicate: () => boolean,
    timeout_ms = 10000,
    interval_ms = 20,
): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout_ms) {
        if (predicate()) return;
        await new Promise((resolve_fn) => setTimeout(resolve_fn, interval_ms));
    }
    throw new Error(`wait_for timed out after ${String(timeout_ms)}ms`);
}

/** 定位 better-sqlite3 原生绑定（与 opencode-extractor.test.ts 同法）。 */
function native_binding_path(): string | undefined {
    const candidates = [
        join(
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
        join(
            process.cwd(),
            "node_modules",
            "better-sqlite3",
            "build",
            "Release",
            "better_sqlite3.node",
        ),
    ];
    return candidates.find((c) => {
        try {
            return readFileSync(c).length > 0;
        } catch {
            return false;
        }
    });
}

/** 打开 opencode sqlite db（优先显式 nativeBinding）。 */
function open_opencode(file: string): Database.Database {
    const binding = native_binding_path();
    return binding ? new Database(file, { nativeBinding: binding }) : new Database(file);
}

/** opencode sqlite db fixture：建 message+part 表，插一条 user text part，返回句柄。 */
function opencode_db(file: string): Database.Database {
    const db = open_opencode(file);
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
    const session_id = "sess_op";
    const insert_msg = db.prepare(
        "INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?,?,?,?,?)",
    );
    insert_msg.run("msg_1", session_id, 1, 1, JSON.stringify({ role: "user" }));
    const insert_part = db.prepare(
        "INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?,?,?,?,?,?)",
    );
    insert_part.run(
        "prt_1",
        "msg_1",
        session_id,
        1,
        1,
        JSON.stringify({ type: "text", text: "你好" }),
    );
    return db;
}

describe("SessionHistorySubscriptionService (t210)", () => {
    let tmp_dir: string;
    let service: SessionHistorySubscriptionService;

    beforeEach(() => {
        tmp_dir = mkdtempSync(join(tmpdir(), "t210-"));
        // 30ms 轮询间隔，加速测试。
        service = new SessionHistorySubscriptionService({ poll_interval_ms: 30 });
    });

    afterEach(() => {
        service.unsubscribe_all();
        rmSync(tmp_dir, { recursive: true, force: true });
    });

    it("轮询策略：grok 文件追加后推送增量，只含新增消息", async () => {
        const file = join(tmp_dir, "chat_history.jsonl");
        writeFileSync(file, JSON.stringify({ type: "user", content: "你好" }) + "\n");

        const received: HistoryMessage[][] = [];
        const sub_id = service.subscribe({
            source: "grok",
            env: "wsl",
            session_id: "s1",
            file_path: file,
            extractor_kind: "grok",
            on_update: (msgs) => {
                received.push([...msgs]);
            },
        });
        expect(sub_id).toBe("grok|wsl|s1");

        // 等待至少一个轮询周期，确认初始 mtime 下无变化不推送。
        await new Promise((resolve) => setTimeout(resolve, 80));
        expect(received).toHaveLength(0);

        // 追加 assistant 消息，等待轮询推送。
        appendFileSync(file, JSON.stringify({ type: "assistant", content: "好的" }) + "\n");
        await wait_for(() => received.length >= 1);

        // 最后一次推送应只含新增 assistant 消息。
        const last = received[received.length - 1];
        expect(last).toHaveLength(1);
        expect(last?.[0]?.role).toBe("assistant");
        expect(last?.[0]?.text).toBe("好的");
    });

    it("grok 增量推送 id 延续全量命名空间，不与已推送 id 冲突（p050）", async () => {
        const file = join(tmp_dir, "chat_history_id.jsonl");
        writeFileSync(
            file,
            JSON.stringify({ type: "user", content: "m1" }) +
                "\n" +
                JSON.stringify({ type: "assistant", content: "m2" }) +
                "\n",
        );

        const received_ids: string[][] = [];
        service.subscribe({
            source: "grok",
            env: "wsl",
            session_id: "s1",
            file_path: file,
            extractor_kind: "grok",
            on_update: (msgs) => {
                received_ids.push(msgs.map((m) => m.id));
            },
        });
        // settle 等首个轮询周期落盘（Windows mtime 量化：紧邻两次写 mtime 常相同，
        // 不等待则追加后 cur !== last_mtime 永不触发，与既有轮询用例同法）。
        await new Promise((resolve) => setTimeout(resolve, 80));
        expect(received_ids).toHaveLength(0);

        appendFileSync(file, JSON.stringify({ type: "user", content: "m3" }) + "\n");
        await wait_for(() => received_ids.length >= 1);

        // 订阅建立时全量提取 id grok:0/grok:1；追加推送应为 grok:2，不得从 0 重计
        expect(received_ids[0]).toEqual(["grok:2"]);
    });

    it("轮询策略：kimi wire.jsonl 增量推送", async () => {
        const file = join(tmp_dir, "wire.jsonl");
        const line1 = JSON.stringify({
            type: "context.append_message",
            time: 1,
            message: { role: "user", content: [{ type: "text", text: "q1" }] },
        });
        writeFileSync(file, line1 + "\n");

        const received: HistoryMessage[][] = [];
        service.subscribe({
            source: "kimi_code",
            env: "wsl",
            session_id: "s2",
            file_path: file,
            extractor_kind: "kimi",
            on_update: (msgs) => received.push([...msgs]),
        });

        // 初始无变化。
        await new Promise((resolve) => setTimeout(resolve, 80));
        expect(received).toHaveLength(0);

        appendFileSync(
            file,
            JSON.stringify({
                type: "context.append_message",
                time: 2,
                message: {
                    role: "assistant",
                    content: [{ type: "text", text: "a1" }],
                },
            }) + "\n",
        );
        await wait_for(() => received.length >= 1);

        const last = received[received.length - 1];
        expect(last).toHaveLength(1);
        expect(last?.[0]?.text).toBe("a1");
    });

    it("幂等 subscribe：同 key 重复订阅不重启 watcher，更新 on_update", async () => {
        const file = join(tmp_dir, "chat_history.jsonl");
        writeFileSync(file, JSON.stringify({ type: "user", content: "x" }) + "\n");

        let call_count_a = 0;
        let call_count_b = 0;
        const id1 = service.subscribe({
            source: "grok",
            env: "wsl",
            session_id: "s3",
            file_path: file,
            extractor_kind: "grok",
            on_update: () => {
                call_count_a += 1;
            },
        });
        const id2 = service.subscribe({
            source: "grok",
            env: "wsl",
            session_id: "s3",
            file_path: file,
            extractor_kind: "grok",
            on_update: () => {
                call_count_b += 1;
            },
        });
        // 同 key 返回同 id。
        expect(id1).toBe(id2);

        appendFileSync(file, JSON.stringify({ type: "assistant", content: "y" }) + "\n");
        await wait_for(() => call_count_b >= 1);

        // 只有第二个 on_update 被调（已被覆盖）。
        expect(call_count_a).toBe(0);
        expect(call_count_b).toBeGreaterThanOrEqual(1);
    });

    it("同 loc 多订阅方并存，各自收推送（t219）", async () => {
        const file = join(tmp_dir, "chat_history_multi.jsonl");
        writeFileSync(file, JSON.stringify({ type: "user", content: "x" }) + "\n");

        const received_a: HistoryMessage[][] = [];
        const received_b: HistoryMessage[][] = [];
        const id_a = service.subscribe({
            source: "grok",
            env: "wsl",
            session_id: "multi",
            file_path: file,
            extractor_kind: "grok",
            subscriber_id: "win-a",
            on_update: (msgs) => received_a.push([...msgs]),
        });
        const id_b = service.subscribe({
            source: "grok",
            env: "wsl",
            session_id: "multi",
            file_path: file,
            extractor_kind: "grok",
            subscriber_id: "win-b",
            on_update: (msgs) => received_b.push([...msgs]),
        });
        // 同 loc 不同 subscriber_id：返回同 key，但两订阅方并存。
        expect(id_a).toBe(id_b);

        await new Promise((resolve) => setTimeout(resolve, 80));
        expect(received_a).toHaveLength(0);
        expect(received_b).toHaveLength(0);

        appendFileSync(file, JSON.stringify({ type: "assistant", content: "y" }) + "\n");
        await wait_for(() => received_a.length >= 1 && received_b.length >= 1);

        // 两订阅方各自收到同一增量（互不串扰）。
        expect(received_a[0]).toEqual(received_b[0]);
        expect(received_a[0]?.[0]?.text).toBe("y");
    });

    it("指定 subscriber_id 注销只移除该订阅方，同 loc 其他订阅方仍收推送（t219）", async () => {
        const file = join(tmp_dir, "chat_history_unsub.jsonl");
        writeFileSync(file, JSON.stringify({ type: "user", content: "x" }) + "\n");

        const received_a: HistoryMessage[][] = [];
        const received_b: HistoryMessage[][] = [];
        service.subscribe({
            source: "grok",
            env: "wsl",
            session_id: "multi2",
            file_path: file,
            extractor_kind: "grok",
            subscriber_id: "win-a",
            on_update: (msgs) => received_a.push([...msgs]),
        });
        service.subscribe({
            source: "grok",
            env: "wsl",
            session_id: "multi2",
            file_path: file,
            extractor_kind: "grok",
            subscriber_id: "win-b",
            on_update: (msgs) => received_b.push([...msgs]),
        });
        await new Promise((resolve) => setTimeout(resolve, 80));

        // 只注销 win-a；win-b 保留。
        service.unsubscribe("grok", "wsl", "multi2", "win-a");

        appendFileSync(file, JSON.stringify({ type: "assistant", content: "y" }) + "\n");
        await wait_for(() => received_b.length >= 1);

        // win-a 已注销不再推送（300ms ≈ 10 个 30ms 轮询周期）。
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(received_a).toHaveLength(0);
        expect(received_b[0]?.[0]?.text).toBe("y");
    });

    it("最后一个订阅方注销：停 watcher、loc 移除、后续追加不再推送（t219 句柄释放）", async () => {
        const file = join(tmp_dir, "chat_history_last_unsub.jsonl");
        writeFileSync(file, JSON.stringify({ type: "user", content: "x" }) + "\n");

        const received: HistoryMessage[][] = [];
        service.subscribe({
            source: "grok",
            env: "wsl",
            session_id: "last",
            file_path: file,
            extractor_kind: "grok",
            subscriber_id: "win-a",
            on_update: (msgs) => received.push([...msgs]),
        });
        service.subscribe({
            source: "grok",
            env: "wsl",
            session_id: "last",
            file_path: file,
            extractor_kind: "grok",
            subscriber_id: "win-b",
            on_update: () => undefined,
        });
        await new Promise((resolve) => setTimeout(resolve, 80));

        // 先注销 win-a（非最后一位），再注销 win-b（最后一位）→ 触发 stop+delete 分支。
        service.unsubscribe("grok", "wsl", "last", "win-a");
        service.unsubscribe("grok", "wsl", "last", "win-b");

        appendFileSync(file, JSON.stringify({ type: "assistant", content: "y" }) + "\n");
        // 300ms ≈ 10 个 30ms 轮询周期：watcher 已停，无任何推送。
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(received).toHaveLength(0);
    });

    it("缺省 subscriber_id（legacy）与显式 subscriber_id 并存不互扰（t219）", async () => {
        const file = join(tmp_dir, "chat_history_legacy.jsonl");
        writeFileSync(file, JSON.stringify({ type: "user", content: "x" }) + "\n");

        const received_legacy: HistoryMessage[][] = [];
        const received_win: HistoryMessage[][] = [];
        service.subscribe({
            source: "grok",
            env: "wsl",
            session_id: "s_legacy",
            file_path: file,
            extractor_kind: "grok",
            on_update: (msgs) => received_legacy.push([...msgs]),
        });
        service.subscribe({
            source: "grok",
            env: "wsl",
            session_id: "s_legacy",
            file_path: file,
            extractor_kind: "grok",
            subscriber_id: "win",
            on_update: (msgs) => received_win.push([...msgs]),
        });
        await new Promise((resolve) => setTimeout(resolve, 80));

        appendFileSync(file, JSON.stringify({ type: "assistant", content: "y" }) + "\n");
        await wait_for(() => received_legacy.length >= 1 && received_win.length >= 1);
        expect(received_legacy[0]).toEqual(received_win[0]);
    });

    it("unsubscribe 后不再推送，句柄释放（clearInterval 不再触发）", async () => {
        const file = join(tmp_dir, "chat_history.jsonl");
        writeFileSync(file, JSON.stringify({ type: "user", content: "x" }) + "\n");

        const received: HistoryMessage[][] = [];
        service.subscribe({
            source: "grok",
            env: "wsl",
            session_id: "s4",
            file_path: file,
            extractor_kind: "grok",
            on_update: (msgs) => received.push([...msgs]),
        });

        service.unsubscribe("grok", "wsl", "s4");

        appendFileSync(file, JSON.stringify({ type: "assistant", content: "z" }) + "\n");
        // 推进多个周期，不应有任何推送。30ms 轮询下 300ms ≈ 10 周期，
        // 整批负载下仍 ≥1 周期（负向断言无法用 wait_for，固定时长是唯一可靠写法）。
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(received).toHaveLength(0);
    });

    it("unsubscribe_all 清空所有订阅", () => {
        const file = join(tmp_dir, "chat_history.jsonl");
        writeFileSync(file, "");
        service.subscribe({
            source: "grok",
            env: "wsl",
            session_id: "a",
            file_path: file,
            extractor_kind: "grok",
            on_update: () => undefined,
        });
        service.subscribe({
            source: "grok",
            env: "wsl",
            session_id: "b",
            file_path: file,
            extractor_kind: "grok",
            on_update: () => undefined,
        });
        // 不抛即可；句柄释放由 setInterval clear 保证。
        expect(() => {
            service.unsubscribe_all();
        }).not.toThrow();
        // 再次 unsubscribe_all 幂等。
        expect(() => {
            service.unsubscribe_all();
        }).not.toThrow();
    });

    it("unsubscribe_all 后追加不再推送（行为断言）", async () => {
        const file = join(tmp_dir, "chat_history.jsonl");
        writeFileSync(file, JSON.stringify({ type: "user", content: "x" }) + "\n");

        const received: HistoryMessage[][] = [];
        service.subscribe({
            source: "grok",
            env: "wsl",
            session_id: "a",
            file_path: file,
            extractor_kind: "grok",
            on_update: (msgs) => received.push([...msgs]),
        });
        service.unsubscribe_all();

        appendFileSync(file, JSON.stringify({ type: "assistant", content: "y" }) + "\n");
        // 推进多个轮询周期，应无任何推送（300ms ≈ 10 周期，负载下仍 ≥1 周期）。
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(received).toHaveLength(0);
    });

    it("全程只读：subscribe/query/推送不修改源文件、不产生额外文件", async () => {
        const file = join(tmp_dir, "chat_history.jsonl");
        const first = JSON.stringify({ type: "user", content: "只读" }) + "\n";
        writeFileSync(file, first);

        const received: HistoryMessage[][] = [];
        service.subscribe({
            source: "grok",
            env: "wsl",
            session_id: "s_ro",
            file_path: file,
            extractor_kind: "grok",
            on_update: (msgs) => received.push([...msgs]),
        });
        // query 走全量提取，也应只读。
        service.query({
            source: "grok",
            env: "wsl",
            session_id: "s_ro",
            file_path: file,
            extractor_kind: "grok",
        });

        // 订阅 + 查询后源文件字节不变，无额外文件（lock/tmp 等）。
        expect(readFileSync(file, "utf-8")).toBe(first);
        expect(readdirSync(tmp_dir).sort()).toEqual(["chat_history.jsonl"]);

        // 追加后推送增量，源文件仍只含测试自己写入的内容。
        const appended = JSON.stringify({ type: "assistant", content: "ok" }) + "\n";
        appendFileSync(file, appended);
        await wait_for(() => received.length >= 1);
        expect(readFileSync(file, "utf-8")).toBe(first + appended);
        expect(readdirSync(tmp_dir).sort()).toEqual(["chat_history.jsonl"]);
    });

    it("JSONL 提取器（claude_code）经 wsl 轮询接入推送增量", async () => {
        const file = join(tmp_dir, "session.jsonl");
        writeFileSync(
            file,
            make_jsonl_line("user", "你好", "u1", "2026-08-05T10:00:00.000Z") + "\n",
        );

        const received: HistoryMessage[][] = [];
        service.subscribe({
            source: "claude_code",
            env: "wsl",
            session_id: "s_cc",
            file_path: file,
            extractor_kind: "claude_code",
            on_update: (msgs) => received.push([...msgs]),
        });

        await new Promise((resolve) => setTimeout(resolve, 80));
        expect(received).toHaveLength(0);

        appendFileSync(
            file,
            make_jsonl_line("assistant", "收到", "a1", "2026-08-05T10:00:01.000Z") + "\n",
        );
        await wait_for(() => received.length >= 1);
        const last = received[received.length - 1];
        expect(last).toHaveLength(1);
        expect(last?.[0]?.role).toBe("assistant");
        expect(last?.[0]?.text).toBe("收到");
    });

    it("opencode sqlite db 经订阅服务轮询接入推送增量（f004）", async () => {
        const db_path = join(tmp_dir, "opencode.db");
        const db = opencode_db(db_path);
        db.close();

        const received: HistoryMessage[][] = [];
        service.subscribe({
            source: "opencode",
            env: "win",
            session_id: "sess_op",
            file_path: db_path,
            extractor_kind: "opencode",
            on_update: (msgs) => received.push([...msgs]),
        });

        await new Promise((resolve_fn) => setTimeout(resolve_fn, 80));
        expect(received).toHaveLength(0);

        // 追加 assistant text part，mtime 变化触发轮询增量。
        const db2 = open_opencode(db_path);
        db2.prepare(
            "INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?,?,?,?,?,?)",
        ).run("prt_2", "msg_1", "sess_op", 2, 2, JSON.stringify({ type: "text", text: "收到" }));
        db2.close();

        await wait_for(() => received.length >= 1);
        const last = received[received.length - 1];
        expect(last).toHaveLength(1);
        expect(last?.[0]?.text).toBe("收到");
    });

    it("query 全量返回所有消息", () => {
        const file = join(tmp_dir, "session.jsonl");
        writeFileSync(
            file,
            make_jsonl_line("user", "你好", "u1", "2026-08-05T10:00:00.000Z") +
                "\n" +
                make_jsonl_line("assistant", "你好，我是助手", "a1", "2026-08-05T10:00:01.000Z") +
                "\n",
        );

        const result = service.query({
            source: "claude_code",
            env: "win",
            session_id: "s5",
            file_path: file,
            extractor_kind: "claude_code",
        });
        expect(result.messages).toHaveLength(2);
        expect(result.messages[0]?.id).toBe("u1");
        expect(result.messages[1]?.id).toBe("a1");
        expect(result.next_cursor).toBeNull();
    });

    it("query 分页：limit + before_cursor 向前翻页", () => {
        const file = join(tmp_dir, "session.jsonl");
        const lines: string[] = [];
        for (let i = 0; i < 5; i += 1) {
            lines.push(
                make_jsonl_line(
                    i % 2 === 0 ? "user" : "assistant",
                    `m${String(i)}`,
                    `id${String(i)}`,
                    `2026-08-05T10:00:0${String(i)}.000Z`,
                ),
            );
        }
        writeFileSync(file, lines.join("\n") + "\n");

        // 第一页：limit=2，取最近 2 条 → m3, m4。
        const page1 = service.query(
            {
                source: "claude_code",
                env: "win",
                session_id: "s6",
                file_path: file,
                extractor_kind: "claude_code",
            },
            { limit: 2 },
        );
        expect(page1.messages.map((m) => m.id)).toEqual(["id3", "id4"]);
        expect(page1.next_cursor).not.toBeNull();

        // 第二页：用 page1.next_cursor 向前。
        const page2 = service.query(
            {
                source: "claude_code",
                env: "win",
                session_id: "s6",
                file_path: file,
                extractor_kind: "claude_code",
            },
            { limit: 2, before_cursor: page1.next_cursor },
        );
        expect(page2.messages.map((m) => m.id)).toEqual(["id1", "id2"]);
        expect(page2.next_cursor).not.toBeNull();

        // 第三页：剩 1 条。
        const page3 = service.query(
            {
                source: "claude_code",
                env: "win",
                session_id: "s6",
                file_path: file,
                extractor_kind: "claude_code",
            },
            { limit: 2, before_cursor: page2.next_cursor },
        );
        expect(page3.messages.map((m) => m.id)).toEqual(["id0"]);
        // 已到顶。
        expect(page3.next_cursor).toBeNull();
    });

    it("query 分页：活跃会话追加新消息后向前翻页不重复不遗漏", () => {
        const file = join(tmp_dir, "session.jsonl");
        const lines: string[] = [];
        for (let i = 0; i < 3; i += 1) {
            lines.push(
                make_jsonl_line(
                    "user",
                    `m${String(i)}`,
                    `id${String(i)}`,
                    `2026-08-05T10:00:0${String(i)}.000Z`,
                ),
            );
        }
        writeFileSync(file, lines.join("\n") + "\n");

        // 第一页：limit=2，取最近 2 条 → id1, id2。
        const page1 = service.query(
            {
                source: "claude_code",
                env: "win",
                session_id: "s7",
                file_path: file,
                extractor_kind: "claude_code",
            },
            { limit: 2 },
        );
        expect(page1.messages.map((m) => m.id)).toEqual(["id1", "id2"]);
        const cursor = page1.next_cursor;

        // 会话活跃：追加新消息 id3。
        appendFileSync(
            file,
            make_jsonl_line("assistant", "m3", "id3", "2026-08-05T10:00:03.000Z") + "\n",
        );

        // 用旧游标翻页：仍取 id1 之前 → [id0]，不重复 id1/id2，不遗漏。
        const page2 = service.query(
            {
                source: "claude_code",
                env: "win",
                session_id: "s7",
                file_path: file,
                extractor_kind: "claude_code",
            },
            { limit: 2, before_cursor: cursor },
        );
        expect(page2.messages.map((m) => m.id)).toEqual(["id0"]);
        expect(page2.next_cursor).toBeNull();
    });

    it("recent_sessions 按 ended_at 降序、limit 截断，含 source/env/session_id/title/agent", () => {
        const rows: SessionRow[] = [
            {
                id: "old",
                source: "claude_code",
                env: "win",
                title: "旧会话",
                model: "claude",
                started_at: 1,
                ended_at: 100,
            },
            {
                id: "new",
                source: "claude_code",
                env: "win",
                title: "新会话",
                model: "claude",
                started_at: 2,
                ended_at: 200,
            },
            {
                id: "mid",
                source: "kimi_code",
                env: "wsl",
                title: null,
                model: null,
                started_at: 3,
                ended_at: 150,
            },
        ];
        const result = service.recent_sessions("claude_code", "win", 10, () =>
            rows.filter((r) => r.source === "claude_code" && r.env === "win"),
        );
        expect(result).toHaveLength(2);
        expect(result[0]?.session_id).toBe("new");
        expect(result[1]?.session_id).toBe("old");
        expect(result[0]?.agent).toBe("claude-code");
        expect(result[0]?.title).toBe("新会话");
        expect(result[0]?.source).toBe("claude_code");
        expect(result[0]?.env).toBe("win");
    });

    it("recent_sessions limit 截断", () => {
        const rows: SessionRow[] = [
            {
                id: "a",
                source: "grok",
                env: "wsl",
                title: null,
                model: null,
                started_at: 1,
                ended_at: 300,
            },
            {
                id: "b",
                source: "grok",
                env: "wsl",
                title: null,
                model: null,
                started_at: 2,
                ended_at: 200,
            },
            {
                id: "c",
                source: "grok",
                env: "wsl",
                title: null,
                model: null,
                started_at: 3,
                ended_at: 100,
            },
        ];
        const result = service.recent_sessions("grok", "wsl", 2, () => rows);
        expect(result).toHaveLength(2);
        expect(result.map((r) => r.session_id)).toEqual(["a", "b"]);
        expect(result[0]?.agent).toBe("grok");
    });

    it("query 对未变化文件使用缓存，追加后刷新缓存", () => {
        const sid = "cache_sid";
        const file = join(tmp_dir, `${sid}.jsonl`);
        writeFileSync(file, make_jsonl_line("user", "first", "m1", "2026-07-10T08:00:00Z") + "\n");

        const first = service.query(
            {
                source: "claude_code",
                env: "win",
                session_id: sid,
                file_path: file,
                extractor_kind: "claude_code",
            },
            { limit: 10 },
        );
        expect(first.messages).toHaveLength(1);

        const cache = (
            service as unknown as { extract_cache: Map<string, { messages: HistoryMessage[] }> }
        ).extract_cache;
        const key = "claude_code|win|cache_sid";
        expect(cache.get(key)?.messages).toHaveLength(1);

        const second = service.query(
            {
                source: "claude_code",
                env: "win",
                session_id: sid,
                file_path: file,
                extractor_kind: "claude_code",
            },
            { limit: 10 },
        );
        expect(second.messages).toHaveLength(1);
        expect(cache.get(key)?.messages).toHaveLength(1);

        appendFileSync(
            file,
            make_jsonl_line("assistant", "second", "m2", "2026-07-10T08:00:01Z") + "\n",
        );
        const third = service.query(
            {
                source: "claude_code",
                env: "win",
                session_id: sid,
                file_path: file,
                extractor_kind: "claude_code",
            },
            { limit: 10 },
        );
        expect(third.messages).toHaveLength(2);
        expect(cache.get(key)?.messages).toHaveLength(2);
    });

    it("subscribe 后首次 query 复用订阅缓存，不重复解析文件", () => {
        const sid = "sub_cache_sid";
        const file = join(tmp_dir, `${sid}.jsonl`);
        writeFileSync(file, make_jsonl_line("user", "hello", "m1", "2026-07-10T08:00:00Z") + "\n");

        service.subscribe({
            source: "claude_code",
            env: "win",
            session_id: sid,
            file_path: file,
            extractor_kind: "claude_code",
            on_update: () => undefined,
        });

        const cache = (
            service as unknown as { extract_cache: Map<string, { messages: HistoryMessage[] }> }
        ).extract_cache;
        const key = "claude_code|win|sub_cache_sid";
        expect(cache.get(key)?.messages).toHaveLength(1);

        const result = service.query(
            {
                source: "claude_code",
                env: "win",
                session_id: sid,
                file_path: file,
                extractor_kind: "claude_code",
            },
            { limit: 10 },
        );
        expect(result.messages).toHaveLength(1);
        expect(cache.get(key)?.messages).toHaveLength(1);
    });

    it("searchContent：批量返回含关键词的会话键集合", async () => {
        const s1 = join(tmp_dir, "search_a.jsonl");
        const s2 = join(tmp_dir, "search_b.jsonl");
        writeFileSync(
            s1,
            make_jsonl_line("user", "hello world", "u1", "2026-08-05T10:00:00Z") + "\n",
        );
        writeFileSync(s2, make_jsonl_line("user", "goodbye", "u2", "2026-08-05T10:00:01Z") + "\n");

        const hits = await service.searchContent(
            [
                {
                    source: "claude_code",
                    env: "win",
                    session_id: "a",
                    file_path: s1,
                    extractor_kind: "claude_code",
                },
                {
                    source: "claude_code",
                    env: "win",
                    session_id: "b",
                    file_path: s2,
                    extractor_kind: "claude_code",
                },
            ],
            "world",
        );
        expect([...hits]).toEqual(["claude_code|win|a"]);
    });

    it("searchContent：并发上限不超过 3", async () => {
        class CountingService extends SessionHistorySubscriptionService {
            running = 0;
            max_running = 0;
            protected override extract_full(
                extractor_kind: "claude_code" | "opencode" | "kimi" | "grok",
                file_path: string,
                session_id: string,
            ) {
                this.running += 1;
                this.max_running = Math.max(this.max_running, this.running);
                const result = super.extract_full(extractor_kind, file_path, session_id);
                this.running -= 1;
                return result;
            }
        }

        const counting_service = new CountingService();
        const locs: {
            source: "claude_code";
            env: "win";
            session_id: string;
            file_path: string;
            extractor_kind: "claude_code";
        }[] = [];
        for (let i = 0; i < 6; i += 1) {
            const file = join(tmp_dir, `conc_${String(i)}.jsonl`);
            writeFileSync(
                file,
                make_jsonl_line(
                    "user",
                    `msg ${String(i)}`,
                    `u${String(i)}`,
                    "2026-08-05T10:00:00Z",
                ) + "\n",
            );
            locs.push({
                source: "claude_code",
                env: "win",
                session_id: `s${String(i)}`,
                file_path: file,
                extractor_kind: "claude_code",
            });
        }

        await counting_service.searchContent(locs, "msg");
        expect(counting_service.max_running).toBeLessThanOrEqual(3);
    });

    it("searchContent：abortSignal 停止启动新 loc", async () => {
        const file = join(tmp_dir, "abort.jsonl");
        const lines: string[] = [];
        for (let i = 0; i < 100; i += 1) {
            lines.push(
                make_jsonl_line(
                    "user",
                    `line ${String(i)}`,
                    `u${String(i)}`,
                    "2026-08-05T10:00:00Z",
                ),
            );
        }
        writeFileSync(file, lines.join("\n") + "\n");

        const controller = new AbortController();
        controller.abort();
        const hits = await service.searchContent(
            [
                {
                    source: "claude_code",
                    env: "win",
                    session_id: "abort",
                    file_path: file,
                    extractor_kind: "claude_code",
                },
            ],
            "line",
            { abortSignal: controller.signal },
        );
        expect([...hits]).toEqual([]);
    });

    it("searchContent：缓存命中时不调用 extract_full", async () => {
        const sid = "search_cache";
        const file = join(tmp_dir, `${sid}.jsonl`);
        writeFileSync(
            file,
            make_jsonl_line("user", "cached keyword", "u1", "2026-08-05T10:00:00Z") + "\n",
        );

        class CountingService extends SessionHistorySubscriptionService {
            extract_count = 0;
            protected override extract_full(
                extractor_kind: "claude_code" | "opencode" | "kimi" | "grok",
                file_path: string,
                session_id: string,
            ) {
                this.extract_count += 1;
                return super.extract_full(extractor_kind, file_path, session_id);
            }
        }

        const counting_service = new CountingService();
        // 先在新实例上建立缓存
        counting_service.query(
            {
                source: "claude_code",
                env: "win",
                session_id: sid,
                file_path: file,
                extractor_kind: "claude_code",
            },
            { limit: 10 },
        );
        expect(counting_service.extract_count).toBe(1);

        const hits = await counting_service.searchContent(
            [
                {
                    source: "claude_code",
                    env: "win",
                    session_id: sid,
                    file_path: file,
                    extractor_kind: "claude_code",
                },
            ],
            "cached",
        );
        expect([...hits]).toEqual([`claude_code|win|${sid}`]);
        expect(counting_service.extract_count).toBe(1);
    });

    it("summaries：返回首条 user 文本前 80 字符", async () => {
        const file = join(tmp_dir, "summary.jsonl");
        writeFileSync(
            file,
            make_jsonl_line("assistant", "hi", "a1", "2026-08-05T10:00:00Z") +
                "\n" +
                make_jsonl_line("user", "u".repeat(120), "u1", "2026-08-05T10:00:01Z") +
                "\n",
        );

        const result = await service.summaries([
            {
                source: "claude_code",
                env: "win",
                session_id: "sum",
                file_path: file,
                extractor_kind: "claude_code",
            },
        ]);
        expect(result["claude_code|win|sum"]).toBe("u".repeat(80));
    });

    it("summaries：无 user 消息时返回空串", async () => {
        const file = join(tmp_dir, "summary_none.jsonl");
        writeFileSync(
            file,
            make_jsonl_line("assistant", "no user", "a1", "2026-08-05T10:00:00Z") + "\n",
        );

        const result = await service.summaries([
            {
                source: "claude_code",
                env: "win",
                session_id: "none",
                file_path: file,
                extractor_kind: "claude_code",
            },
        ]);
        expect(result["claude_code|win|none"]).toBe("");
    });

    it("summaries：缓存命中时不调用轻量扫描", async () => {
        const sid = "summary_cache";
        const file = join(tmp_dir, `${sid}.jsonl`);
        writeFileSync(
            file,
            make_jsonl_line("user", "cached summary", "u1", "2026-08-05T10:00:00Z") + "\n",
        );

        class CountingService extends SessionHistorySubscriptionService {
            first_user_count = 0;
            protected override extract_first_user(
                extractor_kind: "claude_code" | "opencode" | "kimi" | "grok",
                file_path: string,
                session_id: string,
            ) {
                this.first_user_count += 1;
                return super.extract_first_user(extractor_kind, file_path, session_id);
            }
        }

        const counting_service = new CountingService();
        // 先在新实例上建立缓存
        counting_service.query(
            {
                source: "claude_code",
                env: "win",
                session_id: sid,
                file_path: file,
                extractor_kind: "claude_code",
            },
            { limit: 10 },
        );

        const result = await counting_service.summaries([
            {
                source: "claude_code",
                env: "win",
                session_id: sid,
                file_path: file,
                extractor_kind: "claude_code",
            },
        ]);
        expect(result[`claude_code|win|${sid}`]).toBe("cached summary");
        expect(counting_service.first_user_count).toBe(0);
    });
});

describe("summaries 异步让出 (t256)", () => {
    it("摘要任务经 setImmediate 让出事件循环（非同步串行）", async () => {
        // summaries 启动后、任何微任务之前检查 extract 调用次数：
        // 同步实现（无 await setImmediate）在 with_concurrency_limit 启动时即同步
        // 跑完任务 → counter=并发数；异步让出后任务暂停在 setImmediate → counter=0。
        const tmp_dir = mkdtempSync(join(tmpdir(), "t256-sum-"));
        const files: string[] = [];
        try {
            for (let i = 0; i < 3; i++) {
                const f = join(tmp_dir, `s${String(i)}.jsonl`);
                writeFileSync(
                    f,
                    JSON.stringify({ type: "user", content: `msg${String(i)}` }) + "\n",
                );
                files.push(f);
            }
            const service = new SessionHistorySubscriptionService({ poll_interval_ms: 30 });
            let extract_count = 0;
            const spy = vi
                .spyOn(
                    service as unknown as { extract_first_user: () => string },
                    "extract_first_user",
                )
                .mockImplementation(function (this: unknown) {
                    extract_count += 1;
                    return "mocked";
                });

            const locs = files.map((f, i) => ({
                source: "grok" as const,
                env: "wsl" as const,
                session_id: `g${String(i)}`,
                file_path: f,
                extractor_kind: "grok" as const,
            }));
            const pending = service.summaries(locs);
            // 尚未 await：若同步实现 extract 已全部执行；异步让出则 counter=0。
            expect(extract_count).toBe(0);
            // drain 微任务后仍为 0：证明是宏任务（setImmediate）让出而非微任务让出
            // （微任务让出不释放事件循环，会回归 AC1，t256 test f004）。
            await Promise.resolve();
            expect(extract_count).toBe(0);
            const result = await pending;
            // await 后全部 extract 完成。
            expect(extract_count).toBe(3);
            expect(result["grok|wsl|g0"]).toBe("mocked");
            spy.mockRestore();
            service.unsubscribe_all();
        } finally {
            rmSync(tmp_dir, { recursive: true, force: true });
        }
    });
}, 30000);
