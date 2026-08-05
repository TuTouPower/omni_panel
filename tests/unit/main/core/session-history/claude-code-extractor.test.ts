import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { copyFileSync, mkdtempSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
    extract_claude_code,
    extract_claude_code_incremental,
} from "../../../../../src/main/core/session-history/claude-code-extractor";

const fixture = join(__dirname, "../../../../fixtures/session-history/claude_code/session.jsonl");

describe("claude_code extractor (t209)", () => {
    it("只提取 user/assistant 文本，剔 thinking/tool_use/tool_result/system/summary", () => {
        const { messages } = extract_claude_code(fixture);
        // u1(user文本), a2(assistant文本，thinking 已剔), a3(assistant文本)
        // u2 是 tool_result 包装在 user → 剔（content 无 text block）
        // a1 thinking → 剔
        expect(messages.map((m) => m.id)).toEqual(["u1", "a2", "a3"]);
        expect(messages[0]?.role).toBe("user");
        expect(messages[0]?.text).toBe("帮我看看这个文件");
        expect(messages[1]?.role).toBe("assistant");
        expect(messages[1]?.text).toContain("好的，我来读取这个文件");
        // timestamp 顺序
        expect(messages[0]?.timestamp).toBeLessThanOrEqual(messages[1]?.timestamp ?? 0);
    });

    it("返回字节 offset 游标", () => {
        const { cursor } = extract_claude_code(fixture);
        expect(cursor?.kind).toBe("byte_offset");
        if (cursor?.kind === "byte_offset") {
            expect(cursor.file).toBe(fixture);
            expect(cursor.offset).toBeGreaterThan(0);
        }
    });

    it("增量提取追加内容，不重发已提取消息", () => {
        const full = extract_claude_code(fixture);
        if (full.cursor === null) throw new Error("expected non-null cursor");
        const inc = extract_claude_code_incremental(fixture, full.cursor);
        // 未追加新内容 → 增量返回空
        expect(inc.messages).toEqual([]);
    });

    it("增量：文件追加新行后，增量结果 == 全量重提取的尾部，且不重发", () => {
        const tmp = mkdtempSync(join(tmpdir(), "claude-inc-"));
        const tmp_file = join(tmp, "session.jsonl");
        try {
            copyFileSync(fixture, tmp_file);
            const full = extract_claude_code(tmp_file);
            if (full.cursor === null) throw new Error("expected non-null cursor");

            const appended =
                '{"type":"user","uuid":"u9","message":{"role":"user","content":"追加"},"timestamp":"2026-08-05T11:00:00.000Z"}\n';
            appendFileSync(tmp_file, appended);

            const inc = extract_claude_code_incremental(tmp_file, full.cursor);
            // 增量结果恰好是追加的那条消息
            expect(inc.messages).toHaveLength(1);
            expect(inc.messages[0]?.id).toBe("u9");
            expect(inc.messages[0]?.role).toBe("user");
            expect(inc.messages[0]?.text).toBe("追加");
            // 与全量重提取的尾部一致
            const re_full = extract_claude_code(tmp_file);
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

    it("空文件不异常，返回空消息", () => {
        const empty = join(
            __dirname,
            "../../../../fixtures/session-history/claude_code/empty.jsonl",
        );
        const { messages } = extract_claude_code(empty);
        expect(messages).toEqual([]);
    });

    it("非 JSON 行与截断行跳过，不产生脏数据", () => {
        const broken = join(
            __dirname,
            "../../../../fixtures/session-history/claude_code/broken.jsonl",
        );
        const { messages } = extract_claude_code(broken);
        // 只有合法的 1 条 user
        expect(messages).toHaveLength(1);
        expect(messages[0]?.text).toBe("合法行");
    });
});
