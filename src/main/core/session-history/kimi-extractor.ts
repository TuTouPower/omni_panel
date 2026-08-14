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
import { readFileSync, statSync, openSync, readSync, closeSync } from "node:fs";
import type { HistoryMessage, ExtractResult, ExtractCursor } from "./types";
import { read_head } from "./head-read";
import { pick_text_from_content } from "./extract-content";

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
        // t366: 复用单个 slice（含换行），避免对同一区间重复切片分配。
        const raw_line = content.slice(line_start, match.index + 1);
        process_line(raw_line.slice(0, -1), bytes_before, messages);
        bytes_before += Buffer.byteLength(raw_line, "utf-8");
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
    // buf 从 read_start 读起（t366 bounded read），偏移均相对 read_start。
    const rel_offset = cursor.offset - read_start;
    // t365 AC-001: 半行容错（移植 grok）——cursor 可能落在半行中间（上次读取遇写入
    // 半行停在行首），回退到最近行边界重读该完整行，不丢记录。行边界是完整 UTF-8
    // 字符边界，subarray 解码无乱码（t365 AC-002）。
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
    // 重读半行重发同 id（字节 offset 一致）消息——本增量窗口内按 id 去重；跨调用由
    // 上游按 id 去重兜底（游标单调，稳态下不会跨调用重发）。
    const seen = new Set<string>();
    // scan_lines 的 base_offset 需绝对字节（read_start + 相对 parse_start）。
    const tail_text = buf.subarray(parse_start).toString("utf-8");
    const messages = scan_lines(tail_text, read_start + parse_start).filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
    });
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
