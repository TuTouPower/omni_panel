/**
 * claude_code 会话历史消息提取器（t209）。
 *
 * 读 `~/.claude/projects/<proj>/<sess>.jsonl`，每行一个 record。裁剪规则（决策 2）：
 * 仅留 user/assistant 文本，剔 tool_use/tool_result/system/thinking/summary 等。
 * 决策 13：只读主 transcript，不读 agent-*.jsonl。
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

function record_to_message(rec: Record<string, unknown>): HistoryMessage | null {
    const type = rec["type"];
    if (type !== "user" && type !== "assistant") return null;
    const message = rec["message"];
    if (typeof message !== "object" || message === null) return null;
    const m = message as Record<string, unknown>;
    // user/assistant role 由 record type 决定（message.role 可能缺）。
    const role = type;
    const text = pick_text_from_content(m["content"]);
    if (text === null || text === "") return null;
    const id = typeof rec["uuid"] === "string" ? rec["uuid"] : "";
    const ts_raw = rec["timestamp"];
    let timestamp: number | null = null;
    if (typeof ts_raw === "string") {
        const parsed = new Date(ts_raw).getTime();
        if (!Number.isNaN(parsed)) timestamp = parsed;
    }
    return { id, role, text, timestamp };
}

/**
 * 全量提取 file 的消息。空文件返回空。
 * 非法/截断行跳过，不抛。
 */
export function extract_claude_code(file: string): ExtractResult {
    let content: string;
    try {
        content = readFileSync(file, "utf-8");
    } catch {
        return { messages: [], cursor: null };
    }
    const messages: HistoryMessage[] = [];
    const lines = content.split("\n");
    for (const line of lines) {
        if (line.trim() === "") continue;
        let rec: Record<string, unknown>;
        try {
            rec = JSON.parse(line) as Record<string, unknown>;
        } catch {
            continue; // 非 JSON 行跳过
        }
        const msg = record_to_message(rec);
        if (msg) {
            messages.push(msg);
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
export function extract_claude_code_incremental(
    file: string,
    cursor: ExtractCursor,
): ExtractResult {
    if (cursor.kind !== "byte_offset" || cursor.file !== file) {
        return extract_claude_code(file);
    }
    let content: string;
    try {
        const buf = readFileSync(file);
        content = buf.subarray(cursor.offset).toString("utf-8");
    } catch {
        return { messages: [], cursor };
    }
    const messages: HistoryMessage[] = [];
    for (const line of content.split("\n")) {
        if (line.trim() === "") continue;
        let rec: Record<string, unknown>;
        try {
            rec = JSON.parse(line) as Record<string, unknown>;
        } catch {
            continue;
        }
        const msg = record_to_message(rec);
        if (msg) messages.push(msg);
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
