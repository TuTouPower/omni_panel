import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { calendar_date_of, num } from "./reader-utils";
import type {
    AgentSessionUsageRecord,
    TokenStatsDailyUpsert,
    TokenStatsEnv,
    TokenStatsSessionUpsert,
} from "../../../shared/types/token-stats";

// --- Codex rollout.jsonl reader (t445) ---
//
// Codex stores one rollout-*.jsonl per session under dated directories:
//   ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<session_id>.jsonl
// The trailing filename UUID equals session_meta.payload.session_id (d051).
// Token usage lives in `event_msg.payload.type == "token_count"` lines;
// info.total_token_usage is cumulative within the file (d051: 8865→18719→
// 30144), so per-line deltas are attributed to the session (mirrors the
// existing codex connector's prev_total differencing, but per session and
// per hour bucket here instead of (model, day) observations).
// Session attribution: session_meta.payload.cwd → directory; the latest
// turn_context.payload.model → model (segmented per turn_context change).
// archived_sessions does not exist (d051) → missing dir = missing, warn once.
//
// Mirrors grok-reader.ts: mtime-incremental scan, dirty sessions fully
// recounted, store INSERT OR REPLACE keeps it idempotent. Each rollout file
// maps to exactly one session.

const MAX_TITLE_LEN = 120;
const MAX_SCAN_DEPTH = 6;

interface UsageSums {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
}

export interface CodexScanState {
    /** Every discovered file → mtimeMs (parse failures included: skip re-reads). */
    mtimes: Map<string, number>;
    /** Files that yielded usage → resolved session id + parsed facts. */
    files: Map<string, { session_id: string; facts: CodexFileFacts }>;
}

interface CodexFileFacts {
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

export interface CodexScanResult {
    sessions: TokenStatsSessionUpsert[];
    daily: TokenStatsDailyUpsert[];
    records: AgentSessionUsageRecord[];
    new_state: CodexScanState;
    /**
     * True when the sessions root could not be read (missing/unreadable dir).
     * The collector warns once per source instead of every poll (t197 AC5).
     */
    missing: boolean;
    /**
     * t345 AC-001 pattern: 部分文件 stat/read 失败（非目录缺失）。true 时仍返回
     * 已解析部分，collector 报 failed 而非 unavailable。
     */
    file_unreadable: boolean;
}

export function create_codex_scan_state(): CodexScanState {
    return { mtimes: new Map(), files: new Map() };
}

function truncate_title(text: string): string {
    const collapsed = text.replace(/\s+/g, " ").trim();
    return collapsed.length > MAX_TITLE_LEN ? collapsed.slice(0, MAX_TITLE_LEN) : collapsed;
}

function message_id_from_line(line: string): string {
    return crypto.createHash("sha256").update(line).digest("hex").slice(0, 32);
}

/** Trailing UUID of rollout-<ts>-<session_id>.jsonl file name. */
function session_id_from_filename(file: string): string | null {
    const base = path.basename(file);
    const match =
        /^rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i.exec(
            base,
        );
    return match?.[1] ?? null;
}

function collect_rollout_files(dir: string, depth: number, out: string[]): void {
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
            collect_rollout_files(full, depth + 1, out);
        } else if (
            entry.isFile() &&
            entry.name.startsWith("rollout-") &&
            entry.name.endsWith(".jsonl")
        ) {
            out.push(full);
        }
    }
}

interface TokenCount {
    input: number;
    output: number;
    cache_read: number;
    total: number;
    /** Per-event exact usage when Codex provides last_token_usage. */
    last: TokenUsage | null;
}

interface TokenUsage {
    input: number;
    output: number;
    cache_read: number;
    total: number;
}

function parse_token_usage(value: unknown): TokenUsage | null {
    if (typeof value !== "object" || value === null) return null;
    const usage = value as Record<string, unknown>;
    const input = num(usage["input_tokens"]);
    const output = num(usage["output_tokens"]) + num(usage["reasoning_output_tokens"]);
    const cache_read = num(usage["cached_input_tokens"]);
    const grand_raw = usage["total_tokens"];
    const total =
        typeof grand_raw === "number" && Number.isFinite(grand_raw) && grand_raw > 0
            ? grand_raw
            : input + output;
    if (input === 0 && output === 0 && cache_read === 0) return null;
    return { input, output, cache_read, total };
}

function usage_of_token_count(info: unknown): TokenCount | null {
    if (typeof info !== "object" || info === null) {
        return null;
    }
    const record = info as Record<string, unknown>;
    const total = parse_token_usage(record["total_token_usage"]);
    if (!total) return null;
    return {
        ...total,
        last: parse_token_usage(record["last_token_usage"]),
    };
}

function parse_rollout_file(
    content: string,
    env: TokenStatsEnv,
    session_id: string,
): CodexFileFacts | null {
    let cwd: string | null = null;
    let model: string | null = null;
    // 累计差分：同文件单调累计 total_token_usage。codex total 是文件级连续
    // 累计（d051/t449 实测 116 文件 0 回绕、model 切换处无跳变），差分基准
    // 不随 model 重置；model 仅作增量归因标签。
    let segment_model: string | null = null;
    let prev_total: number | null = null;
    let prev_cache: number | null = null;
    let calls = 0;
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
        const payload =
            typeof rec["payload"] === "object" && rec["payload"] !== null
                ? (rec["payload"] as Record<string, unknown>)
                : null;
        if (!payload) {
            continue;
        }
        const type = rec["type"];
        if (type === "session_meta") {
            const meta_cwd = payload["cwd"];
            if (typeof meta_cwd === "string" && meta_cwd !== "" && cwd === null) {
                cwd = meta_cwd;
            }
            const meta_sid = payload["session_id"];
            if (typeof meta_sid === "string" && meta_sid !== "" && meta_sid !== session_id) {
                // 文件名 UUID 与 session_meta 不一致：以文件名为准（d051 实测一致，
                // 不一致时不断言，仅保留文件名归因）。
            }
            continue;
        }
        if (type === "turn_context") {
            const turn_model = payload["model"];
            if (typeof turn_model === "string" && turn_model !== "") {
                model = turn_model;
                if (turn_model !== segment_model) {
                    segment_model = turn_model;
                }
                const turn_cwd = payload["cwd"];
                if (typeof turn_cwd === "string" && turn_cwd !== "" && cwd === null) {
                    cwd = turn_cwd;
                }
            }
            continue;
        }
        if (type !== "event_msg" || payload["type"] !== "token_count") {
            continue;
        }
        const usage = usage_of_token_count(payload["info"]);
        if (!usage) {
            continue;
        }
        const raw_ts = rec["timestamp"];
        const ts =
            typeof raw_ts === "string" || typeof raw_ts === "number"
                ? Date.parse(String(raw_ts))
                : NaN;
        if (!Number.isFinite(ts) || ts === 0) {
            continue;
        }
        const active_model = segment_model ?? model ?? "";
        const prev = prev_total ?? 0;
        const delta = usage.total - prev;
        // 单调累计差分：delta<=0 视为零增量（codex 会对同 total 重复落盘
        // token_count；实测 116 文件 0 回绕 75 相邻重复，delta<=0 若按全量
        // 计入会把整段累计重复吃满——p214 1.3B 虚增根因）。零增量事件不再
        // double 计；prev 推进到 max 保持后续差分基准。基准文件级连续，
        // model 切换不重置（p216 双计根因）。
        const attributable = delta > 0 ? delta : 0;
        prev_total = Math.max(prev, usage.total);
        // cache_read 同为单调累计（OpenAI input 含 cached）：独立差分透传，
        // 零增量事件 cache 增量同样为 0。
        const prev_c = prev_cache ?? 0;
        const cache_delta = delta > 0 ? Math.max(0, usage.cache_read - prev_c) : 0;
        prev_cache = Math.max(prev_c, usage.cache_read);
        if (active_model !== "" && active_model !== segment_model) {
            segment_model = active_model;
        }
        calls++;
        // last_token_usage 是当前事件的精确分项增量。首行可能同时满足
        // last_token_usage === total_token_usage，此时直接计入；重复/回绕事件
        // 仍由累计 total 的正向差分门控，避免重复计数。旧 rollout 没有 last
        // 时保留比例拆分兼容口径。
        const exact = delta > 0 ? usage.last : null;
        const in_delta = exact
            ? exact.input
            : Math.round(attributable * (usage.total > 0 ? usage.input / usage.total : 0));
        const out_delta = exact ? exact.output : attributable - in_delta;
        const raw_cache_delta = exact ? exact.cache_read : cache_delta;
        // OpenAI input_tokens 已含 cached_input_tokens：归一使 input 不含缓存，
        // 与 claude-reader 同语义——面板 tokens=input+output+cache_read 不双计，
        // 缓存率 = cache_read/(input+cache_read) 即真实命中率。
        const effective_cache_delta = Math.max(0, raw_cache_delta);
        const normalized_in = Math.max(0, in_delta - effective_cache_delta);
        sums.input_tokens += normalized_in;
        sums.output_tokens += out_delta;
        sums.cache_read_tokens += effective_cache_delta;
        if (min_ts === null || ts < min_ts) {
            min_ts = ts;
        }
        if (max_ts === null || ts > max_ts) {
            max_ts = ts;
        }
        const date = calendar_date_of(ts);
        const key = `${date}|${active_model}`;
        const entry = daily.get(key) ?? {
            date,
            model: active_model,
            input_tokens: 0,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            calls: 0,
        };
        entry.input_tokens += normalized_in;
        entry.output_tokens += out_delta;
        entry.cache_read_tokens += effective_cache_delta;
        entry.calls++;
        daily.set(key, entry);
        records.push({
            source: "codex",
            env,
            agent: "codex",
            session_id,
            title: null,
            directory: cwd,
            slug: null,
            version: null,
            parent_session_id: null,
            message_id: message_id_from_line(trimmed),
            role: "assistant",
            timestamp: ts,
            model: active_model,
            input_tokens: normalized_in,
            output_tokens: out_delta,
            cache_read_tokens: effective_cache_delta,
            cache_write_tokens: 0,
        });
    }
    if (min_ts === null || max_ts === null || records.length === 0) {
        return null;
    }
    const directory = cwd;
    const title = directory !== null ? truncate_title(path.basename(directory)) : null;
    for (const r of records) {
        r.title = title;
        r.directory = directory;
    }
    return { calls, model, title, directory, min_ts, max_ts, sums, daily, records };
}

function merge_codex_session(
    session_id: string,
    entries: { file: string; facts: CodexFileFacts }[],
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
                source: "codex" as const,
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
            source: "codex",
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

export function scan_codex_rollouts(
    sessions_dir: string,
    env: TokenStatsEnv,
    prev: CodexScanState,
): CodexScanResult {
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
    collect_rollout_files(sessions_dir, 0, found);
    const found_set = new Set(found);
    const new_state = create_codex_scan_state();
    const dirty = new Set<string>();
    for (const [file, entry] of prev.files) {
        if (!found_set.has(file)) {
            dirty.add(entry.session_id);
        }
    }
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
        const session_id = session_id_from_filename(file);
        if (!session_id) {
            new_state.mtimes.set(file, stat.mtimeMs);
            continue;
        }
        const facts = parse_rollout_file(content, env, session_id);
        if (!facts) {
            new_state.mtimes.set(file, stat.mtimeMs);
            continue;
        }
        new_state.mtimes.set(file, stat.mtimeMs);
        new_state.files.set(file, { session_id, facts });
        dirty.add(session_id);
    }
    const by_session = new Map<string, { file: string; facts: CodexFileFacts }[]>();
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
        const merged = merge_codex_session(session_id, entries, env);
        sessions.push(merged.upsert);
        daily.push(...merged.daily);
        records.push(...merged.records);
    }
    return { sessions, daily, records, new_state, missing: false, file_unreadable };
}
