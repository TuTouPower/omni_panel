import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
    AgentSessionUsageRecord,
    TokenStatsDailyUpsert,
    TokenStatsEnv,
    TokenStatsSessionUpsert,
} from "../../../shared/types/token-stats";

// --- Kimi Code wire.jsonl reader ---
//
// Kimi Code stores one wire.jsonl per session under
//   ~/.kimi-code/sessions/<workspace_id>/session_<uuid>/agents/main/wire.jsonl
// Token usage lives in `usage.record` lines (usageScope === "turn"). Session
// scope aggregates (usageScope === "session") are ignored to avoid double
// counting. The session→work directory map comes from session_index.jsonl.
//
// Mirrors claude-reader.ts: mtime-incremental scan, dirty sessions are fully
// recounted, store INSERT OR REPLACE keeps it idempotent. Each wire.jsonl maps
// to exactly one session; the by-session grouping is kept for forward-compat
// (subagent transcripts if Kimi adds them).

const MAX_TITLE_LEN = 120;
const MAX_SCAN_DEPTH = 6;

interface UsageSums {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
}

export interface KimiScanState {
    /** Every discovered file → mtimeMs (parse failures included: skip re-reads). */
    mtimes: Map<string, number>;
    /** Files that yielded usage → resolved session id + parsed facts. */
    files: Map<string, { session_id: string; facts: KimiFileFacts }>;
}

interface KimiFileFacts {
    calls: number;
    model: string | null;
    title: string | null;
    min_ts: number;
    max_ts: number;
    sums: UsageSums;
    daily: Map<string, UsageSums & { calls: number; date: string; model: string }>;
    records: AgentSessionUsageRecord[];
}

export interface KimiScanResult {
    sessions: TokenStatsSessionUpsert[];
    daily: TokenStatsDailyUpsert[];
    records: AgentSessionUsageRecord[];
    new_state: KimiScanState;
}

export function create_kimi_scan_state(): KimiScanState {
    return { mtimes: new Map(), files: new Map() };
}

function truncate_title(text: string): string {
    const collapsed = text.replace(/\s+/g, " ").trim();
    return collapsed.length > MAX_TITLE_LEN ? collapsed.slice(0, MAX_TITLE_LEN) : collapsed;
}

function extract_user_text(message: unknown): string | null {
    if (typeof message !== "object" || message === null) {
        return null;
    }
    const content = (message as Record<string, unknown>)["content"];
    if (typeof content === "string") {
        return content;
    }
    if (Array.isArray(content)) {
        for (const block of content) {
            if (typeof block !== "object" || block === null) {
                continue;
            }
            const b = block as Record<string, unknown>;
            if (b["type"] === "text" && typeof b["text"] === "string") {
                return b["text"];
            }
        }
    }
    return null;
}

function calendar_date_of(ts: number): string {
    const d = new Date(ts);
    const pad = (x: number) => String(x).padStart(2, "0");
    return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function num(v: unknown): number {
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

function message_id_from_line(line: string): string {
    return crypto.createHash("sha256").update(line).digest("hex").slice(0, 32);
}

/** Pull `session_<uuid>` out of .../agents/main/wire.jsonl path. */
function session_id_from_path(file: string): string | null {
    const parts = file.split(/[\\/]/);
    const agents_idx = parts.lastIndexOf("agents");
    if (agents_idx <= 0) {
        return null;
    }
    const sid = parts[agents_idx - 1];
    return typeof sid === "string" && sid !== "" ? sid : null;
}

function collect_wire_files(dir: string, depth: number, out: string[]): void {
    if (depth > MAX_SCAN_DEPTH) {
        return;
    }
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collect_wire_files(full, depth + 1, out);
        } else if (entry.isFile() && entry.name === "wire.jsonl") {
            out.push(full);
        }
    }
}

function read_work_dir_map(index_path: string): Map<string, string> {
    const map = new Map<string, string>();
    let content: string;
    try {
        content = fs.readFileSync(index_path, "utf-8");
    } catch {
        return map;
    }
    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }
        try {
            const entry = JSON.parse(trimmed) as { sessionId?: unknown; workDir?: unknown };
            if (typeof entry.sessionId === "string" && typeof entry.workDir === "string") {
                map.set(entry.sessionId, entry.workDir);
            }
        } catch {
            // skip malformed index line
        }
    }
    return map;
}

function parse_wire_file(
    content: string,
    env: TokenStatsEnv,
    session_id: string,
): KimiFileFacts | null {
    let calls = 0;
    let model: string | null = null;
    let title: string | null = null;
    let min_ts: number | null = null;
    let max_ts: number | null = null;
    const sums: UsageSums = {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
    };
    const daily = new Map<string, UsageSums & { calls: number; date: string; model: string }>();
    const records: AgentSessionUsageRecord[] = [];
    // Byte-identical dedup only — Kimi appends, but resume may rewrite lines.
    const seen_lines = new Set<string>();

    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || seen_lines.has(trimmed)) {
            continue;
        }
        seen_lines.add(trimmed);
        let rec: Record<string, unknown>;
        try {
            rec = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
            continue;
        }

        const type = rec["type"];

        if (type === "context.append_message" && title === null) {
            const message = (rec as { message?: unknown }).message;
            const role = (message as Record<string, unknown> | undefined)?.["role"];
            if (role === "user") {
                const text = extract_user_text(message);
                if (text) {
                    title = truncate_title(text);
                }
            }
        }

        if (type === "usage.record" && rec["usageScope"] === "turn") {
            const usage = rec["usage"] as Record<string, unknown> | undefined;
            const rec_model = typeof rec["model"] === "string" ? rec["model"] : "";
            const ts = num(rec["time"]);
            if (!usage || rec_model === "" || ts === 0) {
                continue;
            }
            const inp = num(usage["inputOther"]);
            const out = num(usage["output"]);
            const cache_read = num(usage["inputCacheRead"]);
            const cache_write = num(usage["inputCacheCreation"]);
            calls++;
            sums.input_tokens += inp;
            sums.output_tokens += out;
            sums.cache_read_tokens += cache_read;
            sums.cache_write_tokens += cache_write;
            model = rec_model;
            if (min_ts === null || ts < min_ts) {
                min_ts = ts;
            }
            if (max_ts === null || ts > max_ts) {
                max_ts = ts;
            }

            const date = calendar_date_of(ts);
            const key = `${date}|${rec_model}`;
            const entry = daily.get(key) ?? {
                date,
                model: rec_model,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                calls: 0,
            };
            entry.input_tokens += inp;
            entry.output_tokens += out;
            entry.cache_read_tokens += cache_read;
            entry.cache_write_tokens += cache_write;
            entry.calls++;
            daily.set(key, entry);

            records.push({
                source: "kimi_code",
                env,
                agent: "kimi-code",
                session_id,
                title: null,
                directory: null,
                slug: null,
                version: null,
                parent_session_id: null,
                message_id: message_id_from_line(trimmed),
                role: "assistant",
                timestamp: ts,
                model: rec_model,
                input_tokens: inp,
                output_tokens: out,
                cache_read_tokens: cache_read,
                cache_write_tokens: cache_write,
            });
        }
    }

    if (min_ts === null || max_ts === null) {
        return null;
    }
    return { calls, model, title, min_ts, max_ts, sums, daily, records };
}

function merge_kimi_session(
    session_id: string,
    entries: { file: string; facts: KimiFileFacts }[],
    env: TokenStatsEnv,
    work_dir: string | null,
): {
    upsert: TokenStatsSessionUpsert;
    daily: TokenStatsDailyUpsert[];
    records: AgentSessionUsageRecord[];
} {
    const sorted = [...entries].sort((a, b) => a.file.localeCompare(b.file));
    let calls = 0;
    let min_ts = Infinity;
    let max_ts = -Infinity;
    let model: string | null = null;
    let title: string | null = null;
    const sums: UsageSums = {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
    };
    const daily = new Map<string, TokenStatsDailyUpsert>();
    const records: AgentSessionUsageRecord[] = [];

    for (const e of sorted) {
        const f = e.facts;
        calls += f.calls;
        sums.input_tokens += f.sums.input_tokens;
        sums.output_tokens += f.sums.output_tokens;
        sums.cache_read_tokens += f.sums.cache_read_tokens;
        sums.cache_write_tokens += f.sums.cache_write_tokens;
        if (f.min_ts < min_ts) {
            min_ts = f.min_ts;
        }
        if (f.max_ts > max_ts) {
            max_ts = f.max_ts;
        }
        model ??= f.model;
        title ??= f.title;
        for (const d of f.daily.values()) {
            const key = `${d.date}|${d.model}`;
            const acc = daily.get(key) ?? {
                id: session_id,
                source: "kimi_code" as const,
                env,
                date: d.date,
                model: d.model,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                calls: 0,
            };
            acc.input_tokens += d.input_tokens;
            acc.output_tokens += d.output_tokens;
            acc.cache_read_tokens += d.cache_read_tokens;
            acc.cache_write_tokens += d.cache_write_tokens;
            acc.calls += d.calls;
            daily.set(key, acc);
        }
        for (const r of f.records) {
            records.push(r);
        }
    }

    const resolved_title = title ?? (work_dir ? path.basename(work_dir) : null);
    for (const r of records) {
        r.title = resolved_title;
        r.directory = work_dir;
    }

    return {
        upsert: {
            id: session_id,
            source: "kimi_code",
            env,
            model,
            title: resolved_title,
            directory: work_dir,
            input_tokens: sums.input_tokens,
            output_tokens: sums.output_tokens,
            cache_read_tokens: sums.cache_read_tokens,
            cache_write_tokens: sums.cache_write_tokens,
            calls,
            started_at: min_ts,
            ended_at: max_ts,
        },
        daily: [...daily.values()],
        records,
    };
}

export function scan_kimi_wire_jsonls(
    sessions_dir: string,
    env: TokenStatsEnv,
    index_path: string,
    prev: KimiScanState,
): KimiScanResult {
    const found: string[] = [];
    collect_wire_files(sessions_dir, 0, found);
    const found_set = new Set(found);

    const new_state = create_kimi_scan_state();
    const dirty = new Set<string>();

    for (const [file, entry] of prev.files) {
        if (!found_set.has(file)) {
            dirty.add(entry.session_id);
        }
    }

    for (const file of found) {
        let stat: fs.Stats;
        try {
            stat = fs.statSync(file);
        } catch {
            continue;
        }
        new_state.mtimes.set(file, stat.mtimeMs);

        const old_entry = prev.files.get(file);
        if (prev.mtimes.get(file) === stat.mtimeMs) {
            if (old_entry) {
                new_state.files.set(file, old_entry);
            }
            continue;
        }

        if (old_entry) {
            dirty.add(old_entry.session_id);
        }

        let content: string;
        try {
            content = fs.readFileSync(file, "utf-8");
        } catch {
            continue;
        }

        const session_id = session_id_from_path(file);
        if (!session_id) {
            continue;
        }
        const facts = parse_wire_file(content, env, session_id);
        if (!facts) {
            continue;
        }
        new_state.files.set(file, { session_id, facts });
        dirty.add(session_id);
    }

    const work_dir_map = read_work_dir_map(index_path);

    const by_session = new Map<string, { file: string; facts: KimiFileFacts }[]>();
    for (const [file, entry] of new_state.files) {
        let arr = by_session.get(entry.session_id);
        if (!arr) {
            arr = [];
            by_session.set(entry.session_id, arr);
        }
        arr.push({ file, facts: entry.facts });
    }

    const sessions: TokenStatsSessionUpsert[] = [];
    const daily: TokenStatsDailyUpsert[] = [];
    const records: AgentSessionUsageRecord[] = [];
    for (const session_id of [...dirty].sort()) {
        const entries = by_session.get(session_id);
        if (!entries || entries.length === 0) {
            continue;
        }
        const work_dir = work_dir_map.get(session_id) ?? null;
        const merged = merge_kimi_session(session_id, entries, env, work_dir);
        sessions.push(merged.upsert);
        for (const d of merged.daily) {
            daily.push(d);
        }
        for (const r of merged.records) {
            records.push(r);
        }
    }

    return { sessions, daily, records, new_state };
}
