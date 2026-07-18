import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
    AgentSessionUsageRecord,
    TokenStatsDailyUpsert,
    TokenStatsEnv,
    TokenStatsSessionUpsert,
} from "../../../shared/types/token-stats";

// --- Types ---

export interface CostsReadResult {
    sessions: TokenStatsSessionUpsert[];
    new_offset: number;
    new_size: number;
}

export interface SessionScanResult {
    sessions: TokenStatsSessionUpsert[];
    daily: TokenStatsDailyUpsert[];
    records: AgentSessionUsageRecord[];
    /** Fresh state object; caller replaces its state with it on success. */
    new_state: SessionScanState;
}

/**
 * Persistent scan state. One Claude session spans MULTIPLE jsonl files: the
 * main transcript <id>.jsonl plus <id>/subagents/agent-*.jsonl (whose records
 * all carry the parent sessionId). Per-file facts are cached so a changed
 * file triggers re-emission of the whole session's merged totals — the store
 * REPLACEs by (session, date, model), so every emitted row must be the full
 * cross-file recount, never a per-file partial.
 */
export interface SessionScanState {
    /** Every discovered file → mtimeMs (parse failures included: skip re-reads). */
    mtimes: Map<string, number>;
    /** Files that yielded usage data → resolved session id + parsed facts. */
    files: Map<string, { session_id: string; facts: SessionFileFacts }>;
}

export function create_session_scan_state(): SessionScanState {
    return { mtimes: new Map(), files: new Map() };
}

interface RawCostLine {
    session_id?: string;
    model?: string;
    timestamp?: string;
    input_tokens?: number;
    output_tokens?: number;
    cache_read_tokens?: number;
    cache_write_tokens?: number;
}

const MAX_TITLE_LEN = 120;
const MAX_SCAN_DEPTH = 3;

// --- costs.jsonl helpers ---

function read_tail(file_path: string, offset: number): string {
    const stat = fs.statSync(file_path);
    if (stat.size <= offset) {
        return "";
    }
    const byte_length = stat.size - offset;
    const fd = fs.openSync(file_path, "r");
    try {
        const buf = Buffer.alloc(byte_length);
        fs.readSync(fd, buf, 0, byte_length, offset);
        return buf.toString("utf-8");
    } finally {
        fs.closeSync(fd);
    }
}

function parse_lines(raw: string): RawCostLine[] {
    if (!raw) {
        return [];
    }
    const results: RawCostLine[] = [];
    for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }
        try {
            results.push(JSON.parse(trimmed) as RawCostLine);
        } catch {
            // skip malformed lines
        }
    }
    return results;
}

function is_excluded(line: RawCostLine): boolean {
    if (line.session_id === "default") {
        return true;
    }
    if (line.model === "unknown") {
        return true;
    }
    if ((line.input_tokens ?? 0) === 0 && (line.output_tokens ?? 0) === 0) {
        return true;
    }
    return false;
}

// --- costs.jsonl reader ---

/**
 * Incrementally read costs.jsonl (cumulative per-session snapshots).
 * Emits upsert deltas carrying only token totals + time range; title,
 * directory and calls are null (provided by scan_session_jsonls).
 */
export function read_costs_jsonl(
    file_path: string,
    env: TokenStatsEnv,
    saved_offset: number,
    saved_size: number,
): CostsReadResult {
    const stat = fs.statSync(file_path);

    // File unchanged since last read
    if (stat.size === saved_size) {
        return { sessions: [], new_offset: stat.size, new_size: stat.size };
    }

    // File was recreated (truncated)
    const offset = stat.size < saved_offset ? 0 : saved_offset;

    const raw = read_tail(file_path, offset);
    const lines = parse_lines(raw);
    const valid = lines.filter((l) => !is_excluded(l));

    // Group by session_id
    const groups = new Map<string, RawCostLine[]>();
    for (const line of valid) {
        const sid = line.session_id ?? "";
        let arr = groups.get(sid);
        if (!arr) {
            arr = [];
            groups.set(sid, arr);
        }
        arr.push(line);
    }

    const sessions: TokenStatsSessionUpsert[] = [];
    for (const [sid, rows] of groups) {
        const timestamps = rows
            .map((r) => new Date(r.timestamp ?? 0).getTime())
            .filter((t) => !Number.isNaN(t));

        if (timestamps.length === 0) {
            continue;
        }

        // Pick the row with the latest timestamp for cumulative token values
        let latest: RawCostLine | null = null;
        let latest_ts = 0;
        for (const row of rows) {
            const ts = new Date(row.timestamp ?? 0).getTime();
            if (!Number.isNaN(ts) && ts >= latest_ts) {
                latest_ts = ts;
                latest = row;
            }
        }
        if (!latest) {
            continue;
        }

        sessions.push({
            id: sid,
            source: "claude_code",
            env,
            model: latest.model ?? null,
            title: null,
            directory: null,
            input_tokens: latest.input_tokens ?? 0,
            output_tokens: latest.output_tokens ?? 0,
            cache_read_tokens: latest.cache_read_tokens ?? 0,
            cache_write_tokens: latest.cache_write_tokens ?? 0,
            calls: null,
            started_at: Math.min(...timestamps),
            ended_at: Math.max(...timestamps),
        });
    }

    return { sessions, new_offset: stat.size, new_size: stat.size };
}

// --- Session JSONL helpers ---

interface UsageSums {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
}

interface SessionFileFacts {
    calls: number;
    model: string | null;
    title: string | null;
    directory: string | null;
    min_ts: number;
    max_ts: number;
    session_id: string | null;
    sums: UsageSums;
    /** "date|model" → tokens + calls (dedup applied) */
    daily: Map<string, UsageSums & { calls: number; date: string; model: string }>;
    /** Per-message records collected from this file. */
    records: AgentSessionUsageRecord[];
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

/**
 * UTC calendar date (YYYY-MM-DD). Claude Code's own /stats buckets usage by
 * UTC day — verified against live data (per-day and per-model totals match
 * only when bucketing by UTC, not collector-local time).
 */
function utc_date_of(ts: number): string {
    return new Date(ts).toISOString().slice(0, 10);
}

function num(v: unknown): number {
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

/** Deterministic message id for Claude JSONL lines (no native message id). */
function message_id_from_line(line: string): string {
    return crypto.createHash("sha256").update(line).digest("hex").slice(0, 32);
}

function parse_session_file(content: string, env: TokenStatsEnv): SessionFileFacts | null {
    let calls = 0;
    let model: string | null = null;
    let title: string | null = null;
    let first_user_text: string | null = null;
    let directory: string | null = null;
    let min_ts: number | null = null;
    let max_ts: number | null = null;
    let session_id: string | null = null;
    const sums: UsageSums = {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
    };
    const daily = new Map<string, UsageSums & { calls: number; date: string; model: string }>();
    const records: AgentSessionUsageRecord[] = [];
    // Collapse byte-identical duplicate lines only (Claude Code rewrites parts
    // of a transcript on resume/interruption). Do NOT key on timestamp+usage:
    // parallel subagent calls legitimately share those, and Claude Code's own
    // /stats counts them — keyed dedup undercounts proxy models by ~2%.
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

        let ts: number | null = null;
        const ts_raw = rec["timestamp"];
        if (typeof ts_raw === "string") {
            const parsed = new Date(ts_raw).getTime();
            if (!Number.isNaN(parsed)) {
                ts = parsed;
                if (min_ts === null || ts < min_ts) min_ts = ts;
                if (max_ts === null || ts > max_ts) max_ts = ts;
            }
        }

        if (
            session_id === null &&
            typeof rec["sessionId"] === "string" &&
            rec["sessionId"] !== ""
        ) {
            session_id = rec["sessionId"];
        }

        if (directory === null && typeof rec["cwd"] === "string" && rec["cwd"] !== "") {
            directory = rec["cwd"];
        }

        const type = rec["type"];
        if (type === "summary" && typeof rec["summary"] === "string" && rec["summary"] !== "") {
            title = truncate_title(rec["summary"]);
        } else if (type === "user" && first_user_text === null) {
            const text = extract_user_text(rec["message"]);
            if (text) {
                first_user_text = truncate_title(text);
            }
        } else if (type === "assistant") {
            const msg = rec["message"] as Record<string, unknown> | undefined;
            const usage = msg?.["usage"] as Record<string, unknown> | undefined;
            if (msg && usage) {
                // "<synthetic>" records are Claude Code internals (warmup,
                // interruption echoes), not real API calls
                const rec_model = typeof msg["model"] === "string" ? msg["model"] : "";
                if (rec_model === "<synthetic>") {
                    continue;
                }
                const inp = num(usage["input_tokens"]);
                const out = num(usage["output_tokens"]);
                calls++;
                const cache_read = num(usage["cache_read_input_tokens"]);
                const cache_write = num(usage["cache_creation_input_tokens"]);
                sums.input_tokens += inp;
                sums.output_tokens += out;
                sums.cache_read_tokens += cache_read;
                sums.cache_write_tokens += cache_write;
                if (rec_model !== "") {
                    model = rec_model;
                }
                if (ts !== null && rec_model !== "") {
                    const date = utc_date_of(ts);
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
                        source: "claude_code",
                        env,
                        agent: "claude-code",
                        session_id: session_id ?? "",
                        title: title ?? first_user_text,
                        directory,
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
        }
    }

    if (min_ts === null || max_ts === null) {
        return null;
    }
    return {
        calls,
        model,
        title: title ?? first_user_text,
        directory,
        min_ts,
        max_ts,
        session_id,
        sums,
        daily,
        records,
    };
}

function collect_jsonl_files(dir: string, depth: number, out: string[]): void {
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
            collect_jsonl_files(full, depth + 1, out);
        } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
            out.push(full);
        }
    }
}

/** Merge all files of one session into a single session upsert + daily rows + records. */
function merge_session_files(
    session_id: string,
    entries: { file: string; facts: SessionFileFacts }[],
    env: TokenStatsEnv,
): {
    upsert: TokenStatsSessionUpsert;
    daily: TokenStatsDailyUpsert[];
    records: AgentSessionUsageRecord[];
} {
    const sorted = [...entries].sort((a, b) => a.file.localeCompare(b.file));
    // The main transcript carries the session's display identity (title, cwd);
    // subagent files only contribute usage.
    const main = sorted.find((e) => path.basename(e.file, ".jsonl") === session_id);

    let calls = 0;
    let min_ts = Infinity;
    let max_ts = -Infinity;
    let model = main?.facts.model ?? null;
    let title = main?.facts.title ?? null;
    let directory = main?.facts.directory ?? null;
    const sums = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 };
    const daily = new Map<string, TokenStatsDailyUpsert>();
    const records: AgentSessionUsageRecord[] = [];

    for (const e of sorted) {
        const f = e.facts;
        calls += f.calls;
        sums.input_tokens += f.sums.input_tokens;
        sums.output_tokens += f.sums.output_tokens;
        sums.cache_read_tokens += f.sums.cache_read_tokens;
        sums.cache_write_tokens += f.sums.cache_write_tokens;
        if (f.min_ts < min_ts) min_ts = f.min_ts;
        if (f.max_ts > max_ts) max_ts = f.max_ts;
        model ??= f.model;
        title ??= f.title;
        directory ??= f.directory;
        for (const d of f.daily.values()) {
            const key = `${d.date}|${d.model}`;
            const acc = daily.get(key) ?? {
                id: session_id,
                source: "claude_code" as const,
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
            records.push({
                ...r,
                session_id,
                title,
                directory,
            });
        }
    }

    return {
        upsert: {
            id: session_id,
            source: "claude_code",
            env,
            model,
            title,
            directory,
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

/**
 * Scan ~/.claude/projects/** for session JSONL files. Only files whose
 * mtime changed since the last scan are re-parsed; per-file facts are kept
 * in `prev` and every file belonging to an affected session is re-merged in
 * full (calls + per-day token usage), so the emitted values are cross-file
 * totals — the store REPLACEs them.
 *
 * A session spans its main transcript plus subagent transcripts that share
 * its sessionId (e.g. <id>/subagents/agent-*.jsonl); emitting per-file rows
 * keyed by sessionId would make the store's REPLACE clobber sibling files.
 *
 * This is the primary Claude token source: ~/.claude/metrics/costs.jsonl
 * stopped being written by newer Claude Code versions (last entry
 * 2026-07-04 on the dev machine).
 */
export function scan_session_jsonls(
    projects_dir: string,
    env: TokenStatsEnv,
    prev: SessionScanState,
): SessionScanResult {
    const found: string[] = [];
    collect_jsonl_files(projects_dir, 0, found);
    const found_set = new Set(found);

    const new_state = create_session_scan_state();
    const dirty = new Set<string>();

    // Files gone since the last scan: their sessions need re-merging.
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
            continue; // not recorded in mtimes → retried next scan
        }
        new_state.mtimes.set(file, stat.mtimeMs);

        const old_entry = prev.files.get(file);
        if (prev.mtimes.get(file) === stat.mtimeMs) {
            if (old_entry) {
                new_state.files.set(file, old_entry);
            }
            continue;
        }

        // Changed file: the session loses this file's old contribution
        // regardless of whether the re-parse succeeds.
        if (old_entry) {
            dirty.add(old_entry.session_id);
        }

        let content: string;
        try {
            content = fs.readFileSync(file, "utf-8");
        } catch {
            continue;
        }

        const facts = parse_session_file(content, env);
        if (!facts) {
            continue;
        }

        const session_id = facts.session_id ?? path.basename(file, ".jsonl");
        new_state.files.set(file, { session_id, facts });
        dirty.add(session_id);
    }

    const by_session = new Map<string, { file: string; facts: SessionFileFacts }[]>();
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
        // Session vanished entirely: nothing to emit; the store keeps its
        // last known rows (same as files that never parse).
        if (!entries || entries.length === 0) {
            continue;
        }
        const merged = merge_session_files(session_id, entries, env);
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
