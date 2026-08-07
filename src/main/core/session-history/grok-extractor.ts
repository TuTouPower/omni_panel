/**
 * grok 会话历史消息提取器（t209）。
 *
 * 读 `<grok 项目>/chat_history.jsonl`，每行 `{type, content}`。
 * 裁剪规则（决策 2）：仅留 user/assistant 文本，剔 system/reasoning/tool_result。
 *
 * chat_history.jsonl 无顶层 timestamp（见 d017）：timestamp 一律 null。
 * 无稳定 id：用 `grok:${lineIndex}`（合法 user/assistant 消息的全局累计序号，0-based）。
 * 增量与全量共享同一 id 命名空间（p050）：增量消息 id = 游标前合法消息数 + 切片内序号，
 * 保证与全量重提取的同一消息 id 一致，历史窗口按 id 去重不会丢新消息或重复显示。
 *
 * 增量：JSONL 按字节 offset（见 ExtractCursor.byte_offset）。半行容错：游标可能落在
 * 行中间（上次读取遇写入半行时停在行首），增量回退到最近行边界重读；文件尾部未完成
 * 半行（无结尾换行）时游标停在该行行首，写入完成后下次读取不丢记录。
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
 * 按行解析合法 user/assistant 消息。id 从 start_index 起全局累计（合法消息才 +1，
 * 与全量提取的 id 命名空间一致）。返回消息与解析后的下一条序号。
 */
function parse_grok_lines(
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
 * 轻量扫描：从文件头开始限量读取（最多 64KB，t255）逐行解析，返回第一条
 * role === "user" 的消息文本。头部窗口内未命中或文件不存在返回空串。
 * 不调用 extract_full，不缓存。
 */
export function extract_grok_first_user(file: string, max_lines = 1000): string {
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
export function extract_grok(file: string): ExtractResult {
    let content: string;
    try {
        content = readFileSync(file, "utf-8");
    } catch {
        return { messages: [], cursor: null };
    }
    const { messages } = parse_grok_lines(content.split("\n"), 0);
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
 * 增量提取：从 cursor.offset 续读追加部分，回退到行边界防半行丢记录。
 * 返回结果与全量重提取的尾部一致（含 id），不重发已提取消息。
 */
export function extract_grok_incremental(file: string, cursor: ExtractCursor): ExtractResult {
    if (cursor.kind !== "byte_offset" || cursor.file !== file) {
        return extract_grok(file);
    }
    let buf: Buffer;
    try {
        buf = readFileSync(file);
    } catch {
        return { messages: [], cursor };
    }
    // 半行容错：cursor.offset 可能落在 JSON 行中间（上次读取停在行首防丢，或 EOF 落
    // 在未完成半行上）。若游标前该行是完整 JSON（游标在行边界），从游标续读不重发；
    // 若是不完整半行，回退到最近行边界（上一个 \n 之后）重读该完整行。
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
    // 全局消息计数：parse_start 之前合法消息数，使增量 id 延续全量 id 空间。
    const head_text = buf.subarray(0, parse_start).toString("utf-8");
    const { next_index } = parse_grok_lines(head_text.split("\n"), 0);
    const tail_text = buf.subarray(parse_start).toString("utf-8");
    const { messages } = parse_grok_lines(tail_text.split("\n"), next_index);
    // 游标推进：文件尾部若为未完成半行（无结尾换行且 JSON 不完整），停在半行行首，
    // 写入完成后下次读取从该行重读不丢记录；完整行（含完整 JSON 但无尾换行）则推进
    // 到文件末尾，避免已完整行被重复重发。
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
        cursor: { kind: "byte_offset", file, offset: new_offset },
    };
}
