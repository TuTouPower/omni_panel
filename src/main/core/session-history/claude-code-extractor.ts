/**
 * claude_code 会话历史消息提取器（t209）。
 *
 * 读 `~/.claude/projects/<proj>/<sess>.jsonl`，每行一个 record。裁剪规则（决策 2）：
 * 仅留 user/assistant 文本，剔 tool_use/tool_result/system/thinking/summary 等。
 * 决策 13：只读主 transcript，不读 agent-*.jsonl。
 *
 * 增量：JSONL 按字节 offset（见 ExtractCursor.byte_offset）。
 */
import { readFileSync, statSync, openSync, readSync, closeSync } from "node:fs";
import type { HistoryMessage, ExtractResult, ExtractCursor } from "./types";
import { read_head, read_tail } from "./head-read";
import { pick_text_from_content } from "./extract-content";
import { normalize_user_display_text } from "./normalize_user_text";

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
    let display_text = text;
    if (role === "user") {
        const norm = normalize_user_display_text(text, { is_meta: rec["isMeta"] === true });
        if (!norm.keep) return null;
        display_text = norm.text;
    }
    const id = typeof rec["uuid"] === "string" ? rec["uuid"] : "";
    const ts_raw = rec["timestamp"];
    let timestamp: number | null = null;
    if (typeof ts_raw === "string") {
        const parsed = new Date(ts_raw).getTime();
        if (!Number.isNaN(parsed)) timestamp = parsed;
    }
    return { id, role, text: display_text, timestamp };
}

/**
 * 轻量扫描：从文件头开始限量读取（最多 64KB，t255）逐行解析，返回第一条
 * role === "user" 的消息文本。头部窗口内未命中或文件不存在返回空串。
 * 不调用 extract_full，不缓存。
 */
export function extract_claude_code_first_user(file: string, max_lines = 1000): string {
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
        const msg = record_to_message(rec);
        if (msg?.role === "user") {
            return msg.text;
        }
    }
    return "";
}

/**
 * 轻量扫描：从文件尾部限量读取逐行倒序解析，返回最后一条 role === "user"
 * 的消息文本。尾部窗口内未命中或文件不存在返回空串。不调用 extract_full，不缓存。
 */
export function extract_claude_code_last_user(file: string, max_lines = 1000): string {
    const content = read_tail(file);
    const lines = content.split("\n");
    const upper = Math.max(0, lines.length - 1);
    const lower = Math.max(-1, lines.length - 1 - max_lines);
    for (let i = upper; i > lower; i -= 1) {
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
        const msg = record_to_message(rec);
        if (msg?.role === "user") {
            return msg.text;
        }
    }
    return "";
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
    let size: number;
    try {
        size = statSync(file).size;
    } catch {
        return { messages: [], cursor };
    }
    // t366 AC-002: 无新增字节时零磁盘读（只 statSync），避免每次 write 触发全量 IO。
    // 半行驻留（offset 停在未完成半行行首）时 size==offset 无新增——该半行仍未补全，
    // 早退空不丢记录；下次追加使 size>offset 走下方半行容错重读。
    if (size <= cursor.offset) {
        return { messages: [], cursor };
    }
    let fd: number;
    let buf: Buffer;
    let read_start: number;
    try {
        // t366 AC-002: 只读增量字节（offset 起）+ 少量回看（找行边界），不全量读盘。
        fd = openSync(file, "r");
        const back_read = Math.min(cursor.offset, 4096);
        read_start = cursor.offset - back_read;
        const read_len = size - read_start;
        buf = Buffer.allocUnsafe(read_len);
        const bytes = readSync(fd, buf, 0, read_len, read_start);
        if (bytes < read_len) buf = buf.subarray(0, bytes);
        closeSync(fd);
    } catch {
        return { messages: [], cursor };
    }
    // buf 从 read_start 读起（t366 bounded read），后续偏移均为相对 read_start。
    const rel_offset = cursor.offset - read_start;
    // t365 AC-001: 半行容错（移植 grok）——cursor 可能落在半行中间（上次读取遇写入
    // 半行停在行首），回退到最近行边界重读该完整行，不丢记录。
    const nl_before = buf.subarray(0, rel_offset).lastIndexOf(0x0a);
    const line_start = nl_before + 1;
    const partial = buf.subarray(line_start, rel_offset).toString("utf-8").trim();
    let parse_start = rel_offset;
    if (partial !== "") {
        let complete = true;
        try {
            JSON.parse(partial);
        } catch {
            complete = false;
        }
        if (!complete) {
            parse_start = line_start;
        }
    }
    // 重读半行可能重发同一行——本增量窗口内按 uuid 去重；跨调用由上游按 id 去重兜底
    // （游标单调，稳态下不会跨调用重发）。
    const seen = new Set<string>();
    const messages: HistoryMessage[] = [];
    const tail_text = buf.subarray(parse_start).toString("utf-8");
    for (const line of tail_text.split("\n")) {
        if (line.trim() === "") continue;
        let rec: Record<string, unknown>;
        try {
            rec = JSON.parse(line) as Record<string, unknown>;
        } catch {
            continue;
        }
        const msg = record_to_message(rec);
        if (!msg) continue;
        if (seen.has(msg.id)) continue;
        seen.add(msg.id);
        messages.push(msg);
    }
    // 游标推进：文件尾部若为未完成半行（无结尾换行且 JSON 不完整），停在半行行首，
    // 写入完成后下次读取从该行重读不丢记录（t365 AC-001）。
    const last_nl_global = buf.lastIndexOf(0x0a);
    const tail_start = last_nl_global + 1;
    let new_offset = buf.length;
    if (tail_start < buf.length) {
        const tail_line = buf.subarray(tail_start).toString("utf-8").trim();
        if (tail_line !== "") {
            let complete = true;
            try {
                JSON.parse(tail_line);
            } catch {
                complete = false;
            }
            if (!complete) {
                new_offset = tail_start;
            }
        }
    }
    // 相对偏移转回绝对（+ read_start）。
    const abs_new_offset = new_offset + read_start;
    return {
        messages,
        cursor: { kind: "byte_offset", file, offset: abs_new_offset },
    };
}
