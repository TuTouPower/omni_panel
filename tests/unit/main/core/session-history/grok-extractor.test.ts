import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { copyFileSync, mkdtempSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
    extract_grok,
    extract_grok_incremental,
} from "../../../../../src/main/core/session-history/grok-extractor";

const fixture = join(__dirname, "../../../../fixtures/session-history/grok/chat_history.jsonl");

describe("grok extractor (t209)", () => {
    it("只提取 user/assistant，过滤 system/reasoning/tool_result 与非 JSON 行", () => {
        const { messages } = extract_grok(fixture);
        // 合法行序：0=hello(user), 1=hi(assistant), 2=多段(user)
        expect(messages.map((m) => m.id)).toEqual(["grok:0", "grok:1", "grok:2"]);
        expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    });

    it("content 字符串与数组两种形态都正确取", () => {
        const { messages } = extract_grok(fixture);
        expect(messages[0]?.text).toBe("hello grok");
        expect(messages[1]?.text).toBe("hi user");
    });

    it("数组多 text 段 join (\\n)", () => {
        const { messages } = extract_grok(fixture);
        expect(messages[2]?.text).toBe("first\nsecond");
    });

    it("timestamp 一律 null（chat_history.jsonl 无时间字段）", () => {
        const { messages } = extract_grok(fixture);
        expect(messages.every((m) => m.timestamp === null)).toBe(true);
    });

    it("返回字节 offset 游标", () => {
        const { cursor } = extract_grok(fixture);
        expect(cursor?.kind).toBe("byte_offset");
        if (cursor?.kind === "byte_offset") {
            expect(cursor.file).toBe(fixture);
            expect(cursor.offset).toBeGreaterThan(0);
        }
    });

    it("增量：全量后游标、增量无新数据返回空", () => {
        const full = extract_grok(fixture);
        if (full.cursor === null) throw new Error("expected non-null cursor");
        const inc = extract_grok_incremental(fixture, full.cursor);
        expect(inc.messages).toEqual([]);
    });

    it("增量：文件追加新行后，增量结果 == 全量重提取的尾部，且不重发", () => {
        const tmp = mkdtempSync(join(tmpdir(), "grok-inc-"));
        const tmp_file = join(tmp, "chat_history.jsonl");
        try {
            copyFileSync(fixture, tmp_file);
            const full = extract_grok(tmp_file);
            if (full.cursor === null) throw new Error("expected non-null cursor");

            const appended = '{"type":"user","content":"追加"}\n';
            appendFileSync(tmp_file, appended);

            const inc = extract_grok_incremental(tmp_file, full.cursor);
            // 增量结果恰好是追加的那条消息
            expect(inc.messages).toHaveLength(1);
            expect(inc.messages[0]?.role).toBe("user");
            expect(inc.messages[0]?.text).toBe("追加");
            // 与全量重提取的尾部一致（grok 增量 id 切片内从 0 起，与全量同名空间
            // 不冲突但 id 不同；比较 role/text，id 差异由游标保证不重发，见提取器注释）。
            const re_full = extract_grok(tmp_file);
            const tail = re_full.messages.slice(-inc.messages.length);
            expect(inc.messages.map((m) => ({ role: m.role, text: m.text }))).toEqual(
                tail.map((m) => ({ role: m.role, text: m.text })),
            );
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
        const empty = join(__dirname, "../../../../fixtures/session-history/grok/empty.jsonl");
        const { messages } = extract_grok(empty);
        expect(messages).toEqual([]);
    });
});
