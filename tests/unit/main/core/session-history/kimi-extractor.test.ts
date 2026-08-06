import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { copyFileSync, mkdtempSync, appendFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
    extract_kimi_code,
    extract_kimi_code_first_user,
    extract_kimi_code_incremental,
} from "../../../../../src/main/core/session-history/kimi-extractor";

const fixture_dir = join(__dirname, "../../../../fixtures/session-history/kimi");
const fixture = join(fixture_dir, "wire.jsonl");
const empty = join(fixture_dir, "empty.jsonl");

describe("kimi_code extractor (t209)", () => {
    it("只提取 context.append_message 的 user/assistant text", () => {
        const { messages } = extract_kimi_code(fixture);
        // wire.jsonl 含 3 条 append_message：
        // - user "hello kimi"
        // - assistant "hi, what can I do?"（content 含 toolCalls 段应过滤）
        // - user "thanks"
        // turn.prompt（2 条）应被忽略；metadata/config.update/tools.set_active_tools/
        //   llm.request/usage.record 跳过；非 JSON 行跳过。
        expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
        expect(messages.map((m) => m.text)).toEqual(["hello kimi", "hi, what can I do?", "thanks"]);
    });

    it("toolCalls 段被过滤，assistant 仅留 text", () => {
        const { messages } = extract_kimi_code(fixture);
        const assistant = messages.find((m) => m.role === "assistant");
        if (assistant === undefined) throw new Error("expected assistant message");
        expect(assistant.text).toBe("hi, what can I do?");
        // 不含 toolCalls 内容
        expect(assistant.text).not.toContain("read_file");
        expect(assistant.text).not.toContain("foo.txt");
    });

    it("role 与 timestamp 取自顶层 time（ms epoch）", () => {
        const { messages } = extract_kimi_code(fixture);
        expect(messages[0]?.role).toBe("user");
        expect(messages[0]?.timestamp).toBe(1700000000010);
        expect(messages[1]?.role).toBe("assistant");
        expect(messages[1]?.timestamp).toBe(1700000000020);
        expect(messages[2]?.role).toBe("user");
        expect(messages[2]?.timestamp).toBe(1700000000040);
    });

    it("id 稳定且唯一（kimi: 前缀 + 字节起始位置）", () => {
        const { messages } = extract_kimi_code(fixture);
        const ids = messages.map((m) => m.id);
        for (const id of ids) {
            expect(id.startsWith("kimi:")).toBe(true);
        }
        expect(new Set(ids).size).toBe(ids.length);
        // 二次提取得到相同 id（稳定）
        const again = extract_kimi_code(fixture).messages.map((m) => m.id);
        expect(again).toEqual(ids);
    });

    it("返回字节 offset 游标", () => {
        const { cursor } = extract_kimi_code(fixture);
        expect(cursor?.kind).toBe("byte_offset");
        if (cursor?.kind === "byte_offset") {
            expect(cursor.file).toBe(fixture);
            expect(cursor.offset).toBeGreaterThan(0);
        }
    });

    it("增量提取：未追加新内容时返回空消息，cursor 不变", () => {
        const full = extract_kimi_code(fixture);
        if (full.cursor === null) throw new Error("expected non-null cursor");
        const inc = extract_kimi_code_incremental(fixture, full.cursor);
        expect(inc.messages).toEqual([]);
        if (full.cursor.kind === "byte_offset" && inc.cursor?.kind === "byte_offset") {
            expect(inc.cursor.offset).toBe(full.cursor.offset);
        }
    });

    it("增量：文件追加新行后，增量结果 == 全量重提取的尾部，且不重发", () => {
        const tmp = mkdtempSync(join(tmpdir(), "kimi-inc-"));
        const tmp_file = join(tmp, "wire.jsonl");
        try {
            copyFileSync(fixture, tmp_file);
            const full = extract_kimi_code(tmp_file);
            if (full.cursor === null) throw new Error("expected non-null cursor");

            const appended =
                '{"type":"context.append_message","message":{"role":"user","content":[{"type":"text","text":"追加"}]},"time":1785000000000}\n';
            appendFileSync(tmp_file, appended);

            const inc = extract_kimi_code_incremental(tmp_file, full.cursor);
            // 增量结果恰好是追加的那条消息
            expect(inc.messages).toHaveLength(1);
            expect(inc.messages[0]?.role).toBe("user");
            expect(inc.messages[0]?.text).toBe("追加");
            // id 与全量重提取对同一行产出相同 id（字节 offset 一致）
            const re_full = extract_kimi_code(tmp_file);
            const tail = re_full.messages.slice(-inc.messages.length);
            expect(inc.messages).toEqual(tail);
            // cursor.offset 前进到新文件末尾
            if (inc.cursor?.kind === "byte_offset" && re_full.cursor?.kind === "byte_offset") {
                expect(inc.cursor.offset).toBe(re_full.cursor.offset);
            }
            if (full.cursor.kind === "byte_offset" && inc.cursor?.kind === "byte_offset") {
                expect(inc.cursor.offset).toBeGreaterThan(full.cursor.offset);
            }
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });

    it("空文件不异常，返回空消息与 offset=0 游标", () => {
        const { messages, cursor } = extract_kimi_code(empty);
        expect(messages).toEqual([]);
        expect(cursor?.kind).toBe("byte_offset");
        if (cursor?.kind === "byte_offset") {
            expect(cursor.file).toBe(empty);
            expect(cursor.offset).toBe(0);
        }
    });

    it("非 JSON 行与干扰事件跳过，不产生脏数据", () => {
        const { messages } = extract_kimi_code(fixture);
        // 仅 3 条 append_message 提取，干扰行不产生消息
        expect(messages).toHaveLength(3);
    });

    it("first_user：首条 user 在顶部时直接返回其文本", () => {
        expect(extract_kimi_code_first_user(fixture)).toBe("hello kimi");
    });

    it("first_user：跳过非 append_message / 非 user 行后返回首条 user 文本", () => {
        const tmp = mkdtempSync(join(tmpdir(), "kimi-first-"));
        const tmp_file = join(tmp, "wire.jsonl");
        try {
            const lines = [
                JSON.stringify({ type: "metadata", message: { role: "user", content: "忽略" } }),
                JSON.stringify({
                    type: "context.append_message",
                    time: 1,
                    message: { role: "assistant", content: [{ type: "text", text: "hi" }] },
                }),
                JSON.stringify({
                    type: "context.append_message",
                    time: 2,
                    message: { role: "user", content: [{ type: "text", text: "真正问题" }] },
                }),
            ];
            writeFileSync(tmp_file, lines.join("\n") + "\n");
            expect(extract_kimi_code_first_user(tmp_file)).toBe("真正问题");
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });

    it("first_user：无 user 消息时返回空串", () => {
        const tmp = mkdtempSync(join(tmpdir(), "kimi-first-none-"));
        const tmp_file = join(tmp, "wire.jsonl");
        try {
            writeFileSync(
                tmp_file,
                JSON.stringify({
                    type: "context.append_message",
                    time: 1,
                    message: { role: "assistant", content: [{ type: "text", text: "只有助手" }] },
                }) + "\n",
            );
            expect(extract_kimi_code_first_user(tmp_file)).toBe("");
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });

    it("first_user：文件缺失时返回空串", () => {
        const missing = join(tmpdir(), `kimi-first-missing-${String(Date.now())}.jsonl`);
        expect(extract_kimi_code_first_user(missing)).toBe("");
    });
});
