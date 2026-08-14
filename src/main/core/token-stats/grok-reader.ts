import * as fs from "node:fs";
import * as path from "node:path";
import { calendar_date_of, num } from "./reader-utils";
import type {
    AgentSessionUsageRecord,
    TokenStatsDailyUpsert,
    TokenStatsEnv,
    TokenStatsSessionUpsert,
} from "../../../shared/types/token-stats";

// --- Grok CLI updates.jsonl reader ---
//
// Grok CLI stores one updates.jsonl per session under
//   ~/.grok/sessions/<enc_cwd>/<session_id>/updates.jsonl
// where <enc_cwd> is the URL-encoded working directory (e.g.
// "%2Fhome%2Ftestuser%2Fgithub_repo") and <session_id> is the parent directory
// name (uuid). Token usage lives in `params.update.sessionUpdate ===
// "turn_completed"` events; each event is the complete aggregate for one user
// prompt's turn (modelCalls/numTurns = loops in that turn), NOT a process or
// session cumulative counter — record the numbers at face value, never
// difference adjacent events (that misreads per-turn totals as cumulative
// snapshots and under-counts every turn after the first).
//
// Mirrors kimi-reader.ts / claude-reader.ts: mtime-incremental scan, dirty
// sessions fully recounted, store INSERT OR REPLACE keeps it idempotent. Each
// updates.jsonl maps to exactly one session; the by-session grouping mirrors
// the kimi/claude readers for consistency.
//
// Field semantics (confirmed against real WSL data, 2026-08):
//   - Every turn_completed carries `prompt_id` (stable) and a root `timestamp`
//     in SECONDS. The CLI's current version emits no `_meta` field, so message
//     id = prompt_id and event time = timestamp * 1000.
//   - usage.reasoningTokens is a subset of usage.outputTokens; it is not
//     billed separately, so output maps directly and reasoning is not recorded.
//   - usage.modelUsage maps model -> per-model usage; a turn may span several
//     models (observed 2-key events). The record model is the sorted keys
//     joined with "+", while token amounts stay the top-level aggregate.

const MAX_TITLE_LEN = 120;
const MAX_SCAN_DEPTH = 4;

interface UsageSums {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
}

export interface GrokScanState {
    /** Every discovered file → mtimeMs (parse failures included: skip re-reads). */
    mtimes: Map<string, number>;
    /** Files that yielded usage → resolved session id + parsed facts. */
    files: Map<string, { session_id: string; facts: GrokFileFacts }>;
}

interface GrokFileFacts {
    calls: number;
    model: string | null;
    title: string | null;
    directory: string | null;
    min_ts: number;
    max_ts: number;
    sums: UsageSums;
    daily: Map<string, UsageSums & { calls: number; date: string; model: string }>;
    records: AgentSessionUsageRecord[];
}

export interface GrokScanResult {
    sessions: TokenStatsSessionUpsert[];
    daily: TokenStatsDailyUpsert[];
    records: AgentSessionUsageRecord[];
    new_state: GrokScanState;
    /**
     * True when the sessions root could not be read (missing/unreadable dir).
     * The collector warns once per source instead of every poll (t197 AC5).
     */
    missing: boolean;
    /**
     * t345 AC-001: 部分文件 stat/read 失败（非目录缺失）。true 时仍返回已
     * 解析部分（sessions/daily/records），collector 报 failed 而非 unavailable。
     */
    file_unreadable: boolean;
}

export function create_grok_scan_state(): GrokScanState {
    return { mtimes: new Map(), files: new Map() };
}

function truncate_title(text: string): string {
    const collapsed = text.replace(/\s+/g, " ").trim();
    return collapsed.length > MAX_TITLE_LEN ? collapsed.slice(0, MAX_TITLE_LEN) : collapsed;
}

function collect_update_files(dir: string, depth: number, out: string[]): void {
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
            collect_update_files(full, depth + 1, out);
        } else if (entry.isFile() && entry.name === "updates.jsonl") {
            out.push(full);
        }
    }
}

function decode_cwd_name(name: string): string {
    try {
        return decodeURIComponent(name);
    } catch {
        return name;
    }
}

/** cwd segment + session id from .../sessions/<enc_cwd>/<session_id>/updates.jsonl. */
function session_parts_from_path(file: string): { cwd_name: string | null; session_id: string } {
    const parts = file.split(/[\\/]/).filter(Boolean);
    const sid_idx = parts.indexOf("updates.jsonl") - 1;
    const cwd_idx = sid_idx - 1;
    return {
        cwd_name: cwd_idx >= 0 ? (parts[cwd_idx] ?? null) : null,
        session_id: parts[sid_idx] ?? "",
    };
}

interface TurnUsage {
    input: number;
    output: number;
    cache_read: number;
}

function usage_of_event(update: Record<string, unknown>): TurnUsage | null {
    const usage = update["usage"];
    if (typeof usage !== "object" || usage === null) {
        return null;
    }
    const u = usage as Record<string, unknown>;
    const input = num(u["inputTokens"]);
    const output = num(u["outputTokens"]);
    const cache_read = num(u["cachedReadTokens"]);
    if (input === 0 && output === 0 && cache_read === 0) {
        return null;
    }
    return { input, output, cache_read };
}

function model_of_event(update: Record<string, unknown>): string | null {
    const usage = update["usage"];
    const mu =
        typeof usage === "object" && usage !== null
            ? (usage as Record<string, unknown>)["modelUsage"]
            : undefined;
    if (typeof mu !== "object" || mu === null) {
        return null;
    }
    const keys = Object.keys(mu);
    if (keys.length === 0) {
        return null;
    }
    return keys.sort().join("+");
}

function parse_update_file(
    content: string,
    env: TokenStatsEnv,
    session_id: string,
    cwd_name: string | null,
): GrokFileFacts | null {
    let calls = 0;
    let model: string | null = null;
    let title: string | null = null;
    let directory: string | null = null;
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
    const seen_prompt_ids = new Set<string>();
    if (cwd_name !== null) {
        const decoded = decode_cwd_name(cwd_name);
        if (decoded !== "") {
            directory = decoded;
            title = truncate_title(path.basename(decoded));
        }
    }

    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }
        let rec: Record<string, unknown>;
        try {
            rec = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
            continue;
        }

        const params = rec["params"] as Record<string, unknown> | undefined;
        const update = params?.["update"];
        if (typeof update !== "object" || update === null) {
            continue;
        }
        const u = update as Record<string, unknown>;
        if (u["sessionUpdate"] !== "turn_completed") {
            continue;
        }

        const prompt_id = typeof u["prompt_id"] === "string" ? u["prompt_id"] : "";
        if (prompt_id === "" || seen_prompt_ids.has(prompt_id)) {
            continue;
        }
        const usage = usage_of_event(u);
        if (!usage) {
            continue;
        }
        // root timestamp is seconds on this CLI build (verified 2026-08).
        const ts = num(rec["timestamp"]) * 1000;
        if (ts === 0) {
            continue;
        }
        seen_prompt_ids.add(prompt_id);
        const rec_model = model_of_event(u) ?? "";
        calls++;
        sums.input_tokens += usage.input;
        sums.output_tokens += usage.output;
        sums.cache_read_tokens += usage.cache_read;
        if (rec_model !== "") {
            model = rec_model;
        }
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
        entry.input_tokens += usage.input;
        entry.output_tokens += usage.output;
        entry.cache_read_tokens += usage.cache_read;
        entry.calls++;
        daily.set(key, entry);

        records.push({
            source: "grok",
            env,
            agent: "grok",
            session_id,
            title,
            directory,
            slug: null,
            version: null,
            parent_session_id: null,
            message_id: prompt_id,
            role: "assistant",
            timestamp: ts,
            model: rec_model,
            input_tokens: usage.input,
            output_tokens: usage.output,
            cache_read_tokens: usage.cache_read,
            cache_write_tokens: 0,
        });
    }

    if (min_ts === null || max_ts === null) {
        return null;
    }
    return { calls, model, title, directory, min_ts, max_ts, sums, daily, records };
}

function merge_grok_session(
    session_id: string,
    entries: { file: string; facts: GrokFileFacts }[],
    env: TokenStatsEnv,
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
    let directory: string | null = null;
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
        directory ??= f.directory;
        for (const d of f.daily.values()) {
            const key = `${d.date}|${d.model}`;
            const acc = daily.get(key) ?? {
                id: session_id,
                source: "grok" as const,
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

    for (const r of records) {
        r.title = title;
        r.directory = directory;
    }

    return {
        upsert: {
            id: session_id,
            source: "grok",
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

export function scan_grok_updates(
    sessions_dir: string,
    env: TokenStatsEnv,
    prev: GrokScanState,
): GrokScanResult {
    // AC5: "缺失/不可读 → warn once". existsSync alone misses unreadable paths
    // (e.g. a file where the sessions dir should be), so also try to readdir.
    let missing = false;
    try {
        if (!fs.existsSync(sessions_dir)) {
            missing = true;
        } else {
            try {
                fs.readdirSync(sessions_dir);
            } catch {
                missing = true;
            }
        }
    } catch {
        missing = true;
    }
    if (missing) {
        // Keep prev state so a temporary absence does not force a full rescan.
        return {
            sessions: [],
            daily: [],
            records: [],
            new_state: prev,
            missing: true,
            file_unreadable: false,
        };
    }

    const found: string[] = [];
    collect_update_files(sessions_dir, 0, found);
    const found_set = new Set(found);

    const new_state = create_grok_scan_state();
    const dirty = new Set<string>();

    for (const [file, entry] of prev.files) {
        if (!found_set.has(file)) {
            dirty.add(entry.session_id);
        }
    }

    // Any per-file stat/read failure marks the source unreadable so the
    // collector warns once, while still collecting the readable files. A
    // failed read does not commit its mtime: a transiently unreadable file is
    // retried on the next scan instead of being skipped until it changes.
    let file_unreadable = false;

    for (const file of found) {
        let stat: fs.Stats;
        try {
            stat = fs.statSync(file);
        } catch {
            file_unreadable = true;
            continue;
        }

        const old_entry = prev.files.get(file);
        if (prev.mtimes.get(file) === stat.mtimeMs) {
            new_state.mtimes.set(file, stat.mtimeMs);
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
            file_unreadable = true;
            continue;
        }

        const parts = session_parts_from_path(file);
        if (!parts.session_id) {
            new_state.mtimes.set(file, stat.mtimeMs);
            continue;
        }
        const facts = parse_update_file(content, env, parts.session_id, parts.cwd_name);
        if (!facts) {
            new_state.mtimes.set(file, stat.mtimeMs);
            continue;
        }
        new_state.mtimes.set(file, stat.mtimeMs);
        new_state.files.set(file, { session_id: parts.session_id, facts });
        dirty.add(parts.session_id);
    }

    const by_session = new Map<string, { file: string; facts: GrokFileFacts }[]>();
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
        const merged = merge_grok_session(session_id, entries, env);
        sessions.push(merged.upsert);
        for (const d of merged.daily) {
            daily.push(d);
        }
        for (const r of merged.records) {
            records.push(r);
        }
    }

    // t345 AC-001: missing 仅指目录缺失；部分文件不可读时仍返回已解析部分，
    // 由 file_unreadable 标记供 collector 报 failed（而非 unavailable 丢弃全部）。
    return {
        sessions,
        daily,
        records,
        new_state,
        missing: false,
        file_unreadable,
    };
}
