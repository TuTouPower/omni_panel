/**
 * codex 会话历史消息提取器（t446）。
 *
 * 读 `~/.codex/sessions/YYYY/MM/DD/rollout-*-<session_id>.jsonl`，每行
 * `{timestamp, ordinal, type, payload}`。裁剪规则（d051/s034 实测）：
 * 仅留 `type=="response_item"` 且 `payload.type=="message"`、role 为
 * user/assistant 的 content 文本（input_text/output_text 拼接）；
 * 剔除 developer、reasoning / function_call / function_call_output /
 * web_search_call、非 response_item 行；非 JSON 行跳过不报错。
 * user 大信封（environment_context/skills_instructions）在归一层处理
 * （normalize_user_display_text，t436 模式），此处保留原文。
 *
 * HistoryMessage.timestamp 取行 timestamp（ISO，非空，d051）。
 * id 用 `codex:${合法消息全局序号}`（0-based，grok 同构 p050）；
 * 增量与全量共享同一 id 命名空间。
 *
 * 增量：JSONL 按字节 offset（ExtractCursor.byte_offset），半行容错与
 * grok-extractor 同构（游标回退行边界 + 尾半行停留行首 + valid_count 延续）。
 */
import { readFileSync, statSync } from "node:fs";
import type { HistoryMessage, ExtractResult, ExtractCursor } from "./types";
import { read_head } from "./head-read";
import { normalize_user_display_text } from "./normalize_user_text";

function text_of_content(content: unknown): string | null {
    if (!Array.isArray(content)) return null;
    const parts: string[] = [];
    for (const block of content) {
        if (typeof block !== "object" || block === null) continue;
        const b = block as Record<string, unknown>;
        const btype = b["type"];
        const btext = b["text"];
        if ((btype === "input_text" || btype === "output_text") && typeof btext === "string") {
            parts.push(btext);
        }
    }
    if (parts.length === 0) return null;
    const text = parts.join("");
    return text === "" ? null : text;
}

function record_to_message(
    rec: Record<string, unknown>,
    line_index: number,
): HistoryMessage | null {
    if (rec["type"] !== "response_item") return null;
    const payload = (rec as { payload?: unknown }).payload as Record<string, unknown> | undefined;
    if (payload?.["type"] !== "message") return null;
    const role = payload["role"];
    if (role !== "user" && role !== "assistant") return null;
    const text = text_of_content(payload["content"]);
    if (text === null) return null;
    let display_text = text;
    if (role === "user") {
        const norm = normalize_user_display_text(text);
        if (!norm.keep) return null;
        display_text = norm.text;
    }
    const raw_ts = rec["timestamp"];
    const ts =
        typeof raw_ts === "string" || typeof raw_ts === "number"
            ? Date.parse(String(raw_ts))
            : NaN;
    if (!Number.isFinite(ts) || ts === 0) return null;
    return {
        id: `codex:${String(line_index)}`,
        role,
        text: display_text,
        timestamp: ts,
    };
}

/**
 * 按行解析合法 user/assistant 消息。id 从 start_index 起全局累计（合法消息才 +1，
 * 与全量提取的 id 命名空间一致）。返回消息与解析后的下一条序号。
 */
function parse_codex_lines(
    lines: readonly string[],
    start_index: number,
): { messages: HistoryMessage[]; next_index: number } {
    const messages: HistoryMessage[] = [];
    let line_index = start_index;
    for (const line of lines) {
        if (line.trim() === "") continue;
        let rec: Record<string, unknown>;
        try {
            rec = JSON.parse(line) as Record<string, unknown>;
        } catch {
            continue; // 非 JSON / 半行跳过
        }
        const msg = record_to_message(rec, line_index);
        if (msg) {
            messages.push(msg);
            line_index += 1;
        }
    }
    return { messages, next_index: line_index };
}

/**
 * 轻量扫描：从文件头开始限量读取逐行解析，返回第一条 role === "user" 的消息文本。
 * 头部窗口内未命中或文件不存在返回空串。不调用 extract_full，不缓存。
 */
export function extract_codex_first_user(file: string, max_lines = 1000): string {
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
        const msg = record_to_message(rec, 0);
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
export function extract_codex(file: string): ExtractResult {
    let content: string;
    try {
        content = readFileSync(file, "utf-8");
    } catch {
        return { messages: [], cursor: null };
    }
    const { messages } = parse_codex_lines(content.split("\n"), 0);
    let offset = 0;
    try {
        offset = statSync(file).size;
    } catch {
        // 保留 offset=0
    }
    const cursor: ExtractCursor = {
        kind: "byte_offset",
        file,
        offset,
        // t366 AC-001: 持久化合法消息数，增量延续 id 命名空间无需重 parse 前缀。
        valid_count: messages.length,
    };
    return { messages, cursor };
}

/**
 * 增量提取：从 cursor.offset 续读追加部分，回退到行边界防半行丢记录。
 * 返回结果与全量重提取的尾部一致（含 id），不重发已提取消息。
 */
export function extract_codex_incremental(file: string, cursor: ExtractCursor): ExtractResult {
    if (cursor.kind !== "byte_offset" || cursor.file !== file) {
        return extract_codex(file);
    }
    let buf: Buffer;
    try {
        buf = readFileSync(file);
    } catch {
        return { messages: [], cursor };
    }
    // 半行容错：cursor.offset 可能落在 JSON 行中间。若游标前该行是完整 JSON
    // （游标在行边界），从游标续读不重发；若是不完整半行，回退到最近行边界重读。
    const nl_before = buf.subarray(0, cursor.offset).lastIndexOf(0x0a);
    const line_start = nl_before + 1;
    const partial = buf.subarray(line_start, cursor.offset).toString("utf-8").trim();
    let parse_start = cursor.offset;
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
    // 全局消息计数：增量 id 延续全量 id 空间。优先用 cursor.valid_count（t366 AC-001，
    // 避免每轮重 parse 前缀）；旧 cursor 无 valid_count 时回退重 parse 前缀。
    let next_index = cursor.valid_count ?? 0;
    if (cursor.valid_count === undefined && parse_start > 0) {
        const head_text = buf.subarray(0, parse_start).toString("utf-8");
        ({ next_index } = parse_codex_lines(head_text.split("\n"), 0));
    }
    const tail_text = buf.subarray(parse_start).toString("utf-8");
    const { messages } = parse_codex_lines(tail_text.split("\n"), next_index);
    // 游标推进：文件尾部若为未完成半行（无结尾换行且 JSON 不完整），停在半行行首，
    // 写入完成后下次读取从该行重读不丢记录；完整行则推进到文件末尾。
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
    return {
        messages,
        cursor: {
            kind: "byte_offset",
            file,
            offset: new_offset,
            // t366 AC-001: 延续计数（parse_start 前 next_index + 本次提取 messages）。
            valid_count: next_index + messages.length,
        },
    };
}
