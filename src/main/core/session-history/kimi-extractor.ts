/**
 * kimi_code 会话历史消息提取器（t209）。
 *
 * 读 `~/.kimi-code/sessions/<workspace_id>/session_<uuid>/agents/main/wire.jsonl`，
 * 每行一个事件 JSON。裁剪规则（决策 2）：仅留 user/assistant 文本，剔 toolCalls
 * 及其他非 text 段。
 *
 * 仅处理 `type === "context.append_message"` 事件（s015 SPIKE 实测，d017）。
 * `turn.prompt` 与 append_message 重复，忽略以去重。
 *
 * 增量：JSONL 按字节 offset（见 ExtractCursor.byte_offset）。
 */
import { readFileSync, statSync } from "node:fs";
import type { HistoryMessage, ExtractResult, ExtractCursor } from "./types";
import { read_head } from "./head-read";

function pick_text_from_content(content: unknown): string | null {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        const texts: string[] = [];
        for (const block of content) {
            if (typeof block !== "object" || block === null) continue;
            const b = block as Record<string, unknown>;
            // 仅取 type === "text"，过滤 toolCalls 与其他类型
            if (b["type"] === "text" && typeof b["text"] === "string") {
                texts.push(b["text"]);
            }
        }
        return texts.length > 0 ? texts.join("\n") : null;
    }
    return null;
}

function event_to_message(
    rec: Record<string, unknown>,
    line_start_offset: number,
): HistoryMessage | null {
    const message = rec["message"];
    if (typeof message !== "object" || message === null) return null;
    const m = message as Record<string, unknown>;
    const role_raw = m["role"];
    if (role_raw !== "user" && role_raw !== "assistant") return null;
    const text = pick_text_from_content(m["content"]);
    if (text === null || text === "") return null;
    const time_raw = rec["time"];
    let timestamp: number | null = null;
    if (typeof time_raw === "number" && Number.isFinite(time_raw)) {
        timestamp = time_raw;
    }
    // kimi 无稳定 id，用 append_message 行在文件中的字节起始位置（稳定、唯一，
    // 全量与增量一致——base_offset 与 line 累计字节均以字节为单位计算）。
    const id = `kimi:${String(line_start_offset)}`;
    return { id, role: role_raw, text, timestamp };
}

function scan_lines(content: string, base_offset: number): HistoryMessage[] {
    const messages: HistoryMessage[] = [];
    // content 由 UTF-8 字节解码而来，line_start 为字符 index。为保持与
    // base_offset（字节）同单位，用 Buffer.byteLength 把已扫过的字符换算成字节，
    // 使全量（base=0）与增量（base=字节 cursor）对同一物理行产出相同 id。
    const eol = /\n/g;
    let line_start = 0;
    let bytes_before = base_offset;
    let match: RegExpExecArray | null;
    while ((match = eol.exec(content)) !== null) {
        const line = content.slice(line_start, match.index);
        process_line(line, bytes_before, messages);
        bytes_before += Buffer.byteLength(content.slice(line_start, match.index + 1), "utf-8");
        line_start = match.index + 1;
    }
    // 末行（无尾换行）
    if (line_start < content.length) {
        process_line(content.slice(line_start), bytes_before, messages);
    }
    return messages;
}

function process_line(line: string, line_start_offset: number, out: HistoryMessage[]): void {
    if (line.trim() === "") return;
    let rec: Record<string, unknown>;
    try {
        rec = JSON.parse(line) as Record<string, unknown>;
    } catch {
        return; // 非 JSON 行跳过
    }
    if (rec["type"] !== "context.append_message") return;
    const msg = event_to_message(rec, line_start_offset);
    if (msg) out.push(msg);
}

/**
 * 轻量扫描：从文件头开始限量读取（最多 64KB，t255）逐行解析，返回第一条
 * role === "user" 的消息文本。头部窗口内未命中或文件不存在返回空串。
 * 不调用 extract_full，不缓存。
 */
export function extract_kimi_code_first_user(file: string, max_lines = 1000): string {
    const content = read_head(file);
    const lines = content.split("\n");
    for (let i = 0; i < Math.min(lines.length, max_lines); i += 1) {
        const line = lines[i];
        if (line === undefined) continue;
        const trimmed = line.trim();
        if (!trimmed) continue;
        let rec: Record<string, unknown>;
        try {
            rec = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
            continue;
        }
        if (rec["type"] !== "context.append_message") continue;
        const msg = event_to_message(rec, 0);
        if (msg?.role === "user") {
            return msg.text;
        }
    }
    return "";
}

/**
 * 全量提取 file 的消息。空文件返回空。
 * 非 JSON 行、非 append_message 行跳过，不抛。
 */
export function extract_kimi_code(file: string): ExtractResult {
    let content: string;
    try {
        content = readFileSync(file, "utf-8");
    } catch {
        return { messages: [], cursor: null };
    }
    const messages = scan_lines(content, 0);
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
export function extract_kimi_code_incremental(file: string, cursor: ExtractCursor): ExtractResult {
    if (cursor.kind !== "byte_offset" || cursor.file !== file) {
        return extract_kimi_code(file);
    }
    let content: string;
    try {
        const buf = readFileSync(file);
        content = buf.subarray(cursor.offset).toString("utf-8");
    } catch {
        return { messages: [], cursor };
    }
    const messages = scan_lines(content, cursor.offset);
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
