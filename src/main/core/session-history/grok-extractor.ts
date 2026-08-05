/**
 * grok 会话历史消息提取器（t209）。
 *
 * 读 `<grok 项目>/chat_history.jsonl`，每行 `{type, content}`。
 * 裁剪规则（决策 2）：仅留 user/assistant 文本，剔 system/reasoning/tool_result。
 *
 * chat_history.jsonl 无顶层 timestamp（见 d017）：timestamp 一律 null。
 * 无稳定 id：用 `grok:${lineIndex}`（合法行的累计序号，0-based）。
 *
 * 增量：JSONL 按字节 offset（见 ExtractCursor.byte_offset）。
 */
import { readFileSync, statSync } from "node:fs";
import type { HistoryMessage, ExtractResult, ExtractCursor } from "./types";

function pick_text_from_content(content: unknown): string | null {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        const texts: string[] = [];
        for (const block of content) {
            if (typeof block !== "object" || block === null) continue;
            const b = block as Record<string, unknown>;
            if (b["type"] === "text" && typeof b["text"] === "string") {
                texts.push(b["text"]);
            }
        }
        return texts.length > 0 ? texts.join("\n") : null;
    }
    return null;
}

function record_to_message(
    rec: Record<string, unknown>,
    line_index: number,
): HistoryMessage | null {
    const type = rec["type"];
    if (type !== "user" && type !== "assistant") return null;
    const text = pick_text_from_content(rec["content"]);
    if (text === null || text === "") return null;
    return {
        id: `grok:${String(line_index)}`,
        role: type,
        text,
        timestamp: null,
    };
}

/**
 * 全量提取 file 的消息。空文件返回空。
 * 非法/截断行跳过，不抛。
 */
export function extract_grok(file: string): ExtractResult {
    let content: string;
    try {
        content = readFileSync(file, "utf-8");
    } catch {
        return { messages: [], cursor: null };
    }
    const messages: HistoryMessage[] = [];
    let line_index = 0;
    for (const line of content.split("\n")) {
        if (line.trim() === "") continue;
        let rec: Record<string, unknown>;
        try {
            rec = JSON.parse(line) as Record<string, unknown>;
        } catch {
            continue; // 非 JSON 行跳过
        }
        const msg = record_to_message(rec, line_index);
        if (msg) {
            messages.push(msg);
            line_index += 1;
        }
    }
    let offset = 0;
    try {
        offset = statSync(file).size;
    } catch {
        // 保留 offset=0
    }
    const cursor: ExtractCursor = { kind: "byte_offset", file, offset };
    return { messages, cursor };
}

/**
 * 增量提取：从 cursor.offset 续读追加部分。
 * 返回结果与全量重提取的尾部一致，不重发已提取消息。
 */
export function extract_grok_incremental(file: string, cursor: ExtractCursor): ExtractResult {
    if (cursor.kind !== "byte_offset" || cursor.file !== file) {
        return extract_grok(file);
    }
    let content: string;
    try {
        const buf = readFileSync(file);
        content = buf.subarray(cursor.offset).toString("utf-8");
    } catch {
        return { messages: [], cursor };
    }
    const messages: HistoryMessage[] = [];
    // 增量切片内的合法行序从 0 起；id 与全量同名空间不冲突（游标保证不重发）。
    let line_index = 0;
    for (const line of content.split("\n")) {
        if (line.trim() === "") continue;
        let rec: Record<string, unknown>;
        try {
            rec = JSON.parse(line) as Record<string, unknown>;
        } catch {
            continue;
        }
        const msg = record_to_message(rec, line_index);
        if (msg) {
            messages.push(msg);
            line_index += 1;
        }
    }
    let new_offset = cursor.offset;
    try {
        new_offset = statSync(file).size;
    } catch {
        // 保留旧 offset
    }
    return {
        messages,
        cursor: { kind: "byte_offset", file, offset: new_offset },
    };
}
