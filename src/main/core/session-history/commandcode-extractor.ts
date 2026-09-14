/**
 * Command Code 会话历史提取器（t484）。
 *
 * Command Code 将会话写入 `~/.commandcode/projects/<encoded-cwd>/<sid>.jsonl`。
 * 每行 message 的正文位于 `message.content[]` 的 text block；这里只保留真人
 * user（`message.meta.source === "user"`）和 assistant 的正文，跳过 thinking、
 * tool_use、tool_result 及未知 block。增量读取沿用 Codex/Grok 的字节游标语义，
 * 包含半行容错、合法消息 id 命名空间延续和截断重写恢复。
 */
import { readFileSync, statSync } from "node:fs";
import type { ExtractCursor, ExtractResult, HistoryMessage } from "./types";
import { read_head, read_tail } from "./head-read";
import { pick_text_from_content } from "./extract-content";
import { normalize_user_display_text } from "./normalize_user_text";

function timestamp_from(rec: Record<string, unknown>): number | null {
    const raw = rec["timestamp"];
    if (typeof raw !== "string" || raw === "") return null;
    const timestamp = Date.parse(raw);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function message_to_history(
    rec: Record<string, unknown>,
    message_index: number,
): HistoryMessage | null {
    if (rec["type"] !== "message") return null;
    const raw_message = rec["message"];
    if (typeof raw_message !== "object" || raw_message === null) return null;
    const message = raw_message as Record<string, unknown>;
    const role = message["role"];
    if (role !== "user" && role !== "assistant") return null;

    if (role === "user") {
        const raw_meta = message["meta"];
        if (typeof raw_meta !== "object" || raw_meta === null) return null;
        if ((raw_meta as Record<string, unknown>)["source"] !== "user") return null;
    }

    const text = pick_text_from_content(message["content"]);
    if (text === null || text === "") return null;
    let display_text = text;
    if (role === "user") {
        const normalized = normalize_user_display_text(text);
        if (!normalized.keep) return null;
        display_text = normalized.text;
    }

    const timestamp = timestamp_from(rec);
    if (timestamp === null) return null;
    return {
        id: `commandcode:${String(message_index)}`,
        role,
        text: display_text,
        timestamp,
    };
}

function parse_lines(
    lines: readonly string[],
    start_index: number,
): { messages: HistoryMessage[]; next_index: number } {
    const messages: HistoryMessage[] = [];
    let message_index = start_index;
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "") continue;
        let record: Record<string, unknown>;
        try {
            record = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
            // 非法 JSON 与尾部未完成半行都留给后续行/下一次增量处理。
            continue;
        }
        const message = message_to_history(record, message_index);
        if (message === null) continue;
        messages.push(message);
        message_index += 1;
    }
    return { messages, next_index: message_index };
}

function stat_of(file: string): { size: number; mtime_ms: number } | null {
    try {
        const stat = statSync(file);
        return { size: stat.size, mtime_ms: stat.mtimeMs };
    } catch {
        return null;
    }
}

function cursor_of(
    file: string,
    offset: number,
    valid_count: number,
    stat: { size: number; mtime_ms: number } | null,
): ExtractCursor {
    return {
        kind: "byte_offset",
        file,
        offset,
        valid_count,
        ...(stat ? { size: stat.size, mtime_ms: stat.mtime_ms } : {}),
    };
}

function empty_result(): ExtractResult {
    return { messages: [], cursor: null };
}

/** 轻量扫描文件头，返回第一条真人 user 文本。 */
export function extract_commandcode_first_user(file: string, max_lines = 1000): string {
    const content = read_head(file);
    const lines = content.split("\n");
    for (let index = 0; index < Math.min(lines.length, max_lines); index += 1) {
        const line = lines[index];
        if (line === undefined || line.trim() === "") continue;
        let record: Record<string, unknown>;
        try {
            record = JSON.parse(line.trim()) as Record<string, unknown>;
        } catch {
            continue;
        }
        const message = message_to_history(record, 0);
        if (message?.role === "user") return message.text;
    }
    return "";
}

/** 轻量扫描文件尾，返回最后一条真人 user 文本。 */
export function extract_commandcode_last_user(file: string, max_lines = 1000): string {
    const content = read_tail(file);
    const lines = content.split("\n");
    const upper = Math.max(0, lines.length - 1);
    const lower = Math.max(-1, lines.length - 1 - max_lines);
    for (let index = upper; index > lower; index -= 1) {
        const line = lines[index];
        if (line === undefined || line.trim() === "") continue;
        let record: Record<string, unknown>;
        try {
            record = JSON.parse(line.trim()) as Record<string, unknown>;
        } catch {
            continue;
        }
        const message = message_to_history(record, 0);
        if (message?.role === "user") return message.text;
    }
    return "";
}

/** 全量提取；文件不可读时返回空结果。 */
export function extract_commandcode(file: string): ExtractResult {
    let content: string;
    try {
        content = readFileSync(file, "utf8");
    } catch {
        return empty_result();
    }
    const { messages } = parse_lines(content.split(/\r?\n/), 0);
    const stat = stat_of(file);
    const offset = stat?.size ?? Buffer.byteLength(content, "utf8");
    return {
        messages,
        cursor: cursor_of(file, offset, messages.length, stat),
    };
}

function full_after_rewrite(file: string): ExtractResult {
    const full = extract_commandcode(file);
    return { ...full, replace_cache: true };
}

/**
 * 增量提取：只解析游标后的完整行；游标落在半行或多字节字符中间时回退到
 * 最近换行。文件被截断，或同尺寸文件被重写（mtime 变化）时回退全量，避免
 * 把新文件内容接在旧 cache 后面。
 */
export function extract_commandcode_incremental(
    file: string,
    cursor: ExtractCursor,
): ExtractResult {
    if (cursor.kind !== "byte_offset" || cursor.file !== file) {
        return extract_commandcode(file);
    }

    const stat = stat_of(file);
    if (stat === null) return { messages: [], cursor };
    if (stat.size < cursor.offset) return full_after_rewrite(file);
    if (
        cursor.size !== undefined &&
        cursor.mtime_ms !== undefined &&
        stat.size === cursor.size &&
        stat.mtime_ms !== cursor.mtime_ms
    ) {
        return full_after_rewrite(file);
    }
    if (stat.size <= cursor.offset) {
        return {
            messages: [],
            cursor: cursor_of(file, cursor.offset, cursor.valid_count ?? 0, stat),
        };
    }

    let buffer: Buffer;
    try {
        buffer = readFileSync(file);
    } catch {
        return { messages: [], cursor };
    }

    const offset = Math.min(cursor.offset, buffer.length);
    const newline_before = buffer.subarray(0, offset).lastIndexOf(0x0a);
    const line_start = newline_before + 1;
    const partial = buffer.subarray(line_start, offset).toString("utf8").trim();
    let parse_start = offset;
    if (partial !== "") {
        try {
            JSON.parse(partial);
        } catch {
            parse_start = line_start;
        }
    }

    let next_index = cursor.valid_count ?? 0;
    if (cursor.valid_count === undefined && parse_start > 0) {
        const head = buffer.subarray(0, parse_start).toString("utf8");
        ({ next_index } = parse_lines(head.split(/\r?\n/), 0));
    }
    const tail = buffer.subarray(parse_start).toString("utf8");
    const parsed = parse_lines(tail.split(/\r?\n/), next_index);

    // 无结尾换行且尾行不是完整 JSON 时，游标停在该行起点；下次追加会重读整行。
    const last_newline = buffer.lastIndexOf(0x0a);
    const tail_start = last_newline + 1;
    let new_offset = buffer.length;
    if (tail_start < buffer.length) {
        const tail_line = buffer.subarray(tail_start).toString("utf8").trim();
        if (tail_line !== "") {
            try {
                JSON.parse(tail_line);
            } catch {
                new_offset = tail_start;
            }
        }
    }
    return {
        messages: parsed.messages,
        cursor: cursor_of(file, new_offset, parsed.next_index, stat),
    };
}
