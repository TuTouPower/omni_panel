import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { copyFileSync, mkdtempSync, appendFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
    extract_grok,
    extract_grok_first_user,
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
            // 与全量重提取的尾部完全一致（p050 后增量 id 共享全量命名空间，含 id）
            const re_full = extract_grok(tmp_file);
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
        const empty = join(__dirname, "../../../../fixtures/session-history/grok/empty.jsonl");
        const { messages } = extract_grok(empty);
        expect(messages).toEqual([]);
    });

    it("增量 id 与全量 id 全局不冲突（p050）", () => {
        const tmp = mkdtempSync(join(tmpdir(), "grok-id-"));
        const tmp_file = join(tmp, "chat_history.jsonl");
        try {
            copyFileSync(fixture, tmp_file);
            const full = extract_grok(tmp_file);
            if (full.cursor === null) throw new Error("expected non-null cursor");
            const before_ids = new Set(full.messages.map((m) => m.id));

            appendFileSync(tmp_file, '{"type":"user","content":"追加"}\n');
            const inc = extract_grok_incremental(tmp_file, full.cursor);

            expect(inc.messages).toHaveLength(1);
            // 增量 id 不得与已提取任何 id 冲突（否则 merge_tail 去重会把新消息当重复丢弃）
            expect(before_ids.has(inc.messages[0]?.id ?? "")).toBe(false);
            // 且与全量重提取的同一消息 id 一致（同名空间，兜底重拉不产生重复显示）
            const re_full = extract_grok(tmp_file);
            const tail = re_full.messages.slice(-1)[0];
            expect(inc.messages[0]?.id).toBe(tail?.id);
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });

    it("半行写入：cursor 落在行中间时增量不丢该记录（p050）", () => {
        const tmp = mkdtempSync(join(tmpdir(), "grok-half-"));
        const tmp_file = join(tmp, "chat_history.jsonl");
        try {
            // 尾部半行无结尾换行（写入中断）
            writeFileSync(
                tmp_file,
                '{"type":"user","content":"前段"}\n{"type":"assistant","content":"半行前半',
            );
            const full = extract_grok(tmp_file);
            if (full.cursor === null) throw new Error("expected non-null cursor");

            // 补全半行 + 追加新行
            appendFileSync(tmp_file, '半"}\n{"type":"user","content":"新行"}\n');
            const inc = extract_grok_incremental(tmp_file, full.cursor);

            // 增量拿到补全的那条 + 新行，且 id 全部落在全量同名空间（不丢记录）
            const texts = inc.messages.map((m) => m.text);
            expect(texts).toContain("半行前半半");
            expect(texts).toContain("新行");
            const re_full = extract_grok(tmp_file);
            const ids = new Set(re_full.messages.map((m) => m.id));
            expect(inc.messages).toHaveLength(2);
            for (const m of inc.messages) {
                expect(ids.has(m.id)).toBe(true);
            }
            // 增量游标推进到文件末尾：下次增量不再重读
            if (
                inc.cursor?.kind === "byte_offset" &&
                full.cursor.kind === "byte_offset" &&
                re_full.cursor?.kind === "byte_offset"
            ) {
                expect(inc.cursor.offset).toBe(re_full.cursor.offset);
                expect(inc.cursor.offset).toBeGreaterThan(full.cursor.offset);
            }
            const again = extract_grok_incremental(tmp_file, inc.cursor ?? full.cursor);
            expect(again.messages).toEqual([]);
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });

    it("完整末行无尾换行：增量不重发该行、游标推进到文件末尾（f001）", () => {
        const tmp = mkdtempSync(join(tmpdir(), "grok-eof-"));
        const tmp_file = join(tmp, "chat_history.jsonl");
        try {
            // 完整两行，末行无结尾换行
            writeFileSync(
                tmp_file,
                '{"type":"user","content":"a"}\n{"type":"assistant","content":"b"}',
            );
            const full = extract_grok(tmp_file);
            if (full.cursor === null) throw new Error("expected non-null cursor");
            expect(full.messages.map((m) => m.id)).toEqual(["grok:0", "grok:1"]);

            // 无新增数据：增量不得重发已完整的末行
            const inc = extract_grok_incremental(tmp_file, full.cursor);
            expect(inc.messages).toEqual([]);
            if (inc.cursor?.kind === "byte_offset" && full.cursor.kind === "byte_offset") {
                expect(inc.cursor.offset).toBe(full.cursor.offset);
            }

            // 追加后增量只拿新内容，id 延续全量空间
            appendFileSync(tmp_file, '\n{"type":"user","content":"c"}\n');
            const inc2 = extract_grok_incremental(tmp_file, inc.cursor ?? full.cursor);
            expect(inc2.messages.map((m) => m.id)).toEqual(["grok:2"]);
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });

    it("first_user：首条 user 在顶部时直接返回其文本", () => {
        expect(extract_grok_first_user(fixture)).toBe("hello grok");
    });

    it("first_user：跳过 system/assistant 行后返回首条 user 文本", () => {
        const tmp = mkdtempSync(join(tmpdir(), "grok-first-"));
        const tmp_file = join(tmp, "chat_history.jsonl");
        try {
            writeFileSync(
                tmp_file,
                '{"type":"system","content":"system prompt"}\n' +
                    '{"type":"assistant","content":"hi"}\n' +
                    '{"type":"user","content":"真正问题"}\n',
            );
            expect(extract_grok_first_user(tmp_file)).toBe("真正问题");
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });

    it("first_user：无 user 消息时返回空串", () => {
        const tmp = mkdtempSync(join(tmpdir(), "grok-first-none-"));
        const tmp_file = join(tmp, "chat_history.jsonl");
        try {
            writeFileSync(
                tmp_file,
                '{"type":"assistant","content":"只有助手"}\n',
            );
            expect(extract_grok_first_user(tmp_file)).toBe("");
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });

    it("first_user：文件缺失时返回空串", () => {
        const missing = join(tmpdir(), `grok-first-missing-${String(Date.now())}.jsonl`);
        expect(extract_grok_first_user(missing)).toBe("");
    });
});
