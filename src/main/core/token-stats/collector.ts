import * as fs from "node:fs";
import type {
    TokenStatsConfig,
    TokenStatsDailyUpsert,
    TokenStatsEnv,
    TokenStatsSessionUpsert,
    TokenStatsSource,
    TokenStatsUpdate,
} from "../../../shared/types/token-stats";
import { read_costs_jsonl, scan_session_jsonls, create_session_scan_state } from "./claude-reader";
import type { SessionScanState } from "./claude-reader";
import { read_opencode_sessions } from "./opencode-reader";
import { scan_kimi_wire_jsonls, create_kimi_scan_state } from "./kimi-reader";
import type { KimiScanState } from "./kimi-reader";
import { writeJsonAtomic } from "../storage/write-json";

// --- Constants ---

const MAX_RECORDS = 10000;

// --- Types ---

interface CostsState {
    offset: number;
    size: number;
}

interface SourceDef {
    key: string;
    source: TokenStatsSource;
    kind: "costs" | "session_jsonl" | "opencode_db" | "kimi_jsonl";
    env: TokenStatsEnv;
    wsl: boolean;
}

// --- Module state ---

interface ParentPortLike {
    postMessage(message: unknown): void;
    on(event: "message", listener: (e: { data: unknown }) => void): void;
}

// process.parentPort is Electron's utilityProcess API, absent in plain Node (tests).
// Read lazily: in the utility child it exists at load time; in tests it may be
// installed after module import.
function get_parent_port(): ParentPortLike | undefined {
    return (process as unknown as { parentPort?: ParentPortLike }).parentPort;
}

// Structured log forwarding: the collector is a utilityProcess child without
// the main logger. Forward log events to the parent via postMessage so they go
// through the main logger (scrubber redaction + 7-day rotation) instead of
// plain console.error on stderr (D7). No-ops when no parent port (tests).
export type CollectorLogLevel = "warn" | "error";
export interface CollectorLogMessage {
    type: "collector_log";
    level: CollectorLogLevel;
    module: string;
    message: string;
}

export function forward_log(level: CollectorLogLevel, module: string, message: string): void {
    const port = get_parent_port();
    if (port) {
        try {
            const payload: CollectorLogMessage = {
                type: "collector_log",
                level,
                module,
                message,
            };
            port.postMessage(payload);
        } catch {
            // parent port gone — fall back to console so we at least see it

            console[level === "error" ? "error" : "warn"](`[${module}] ${message}`);
        }
    } else {
        console[level === "error" ? "error" : "warn"](`[${module}] ${message}`);
    }
}

let config: TokenStatsConfig | null = null;
let interval_id: ReturnType<typeof setInterval> | null = null;

const costs_state = new Map<string, CostsState>();
const opencode_max_updated = new Map<string, number>();
const jsonl_states = new Map<string, SessionScanState>();
const kimi_states = new Map<string, KimiScanState>();

// --- Scan-state persistence (t114) ---
//
// Persist mtime + session facts (minus records, already stored) so the
// collector resumes incrementally after restart instead of rescanning every
// jsonl. Loaded once on configure; saved after each collect.

interface SerializedScanState {
    costs_state?: Record<string, { offset: number; size: number }>;
    opencode_max_updated?: Record<string, number>;
    jsonl_states?: Record<string, SerializedScanBucket>;
    kimi_states?: Record<string, SerializedScanBucket>;
}

interface SerializedScanBucket {
    mtimes?: Record<string, number>;
    files?: Record<
        string,
        {
            session_id: string;
            facts?: Record<string, unknown>;
        }
    >;
}

function serialize_bucket(state: SessionScanState | KimiScanState): SerializedScanBucket {
    const mtimes: Record<string, number> = {};
    // mtimeMs preserved as float so reader's strict === comparison still
    // matches after a round-trip (rounding would mark every file dirty).
    for (const [file, mtime] of state.mtimes) mtimes[file] = mtime;
    const files: SerializedScanBucket["files"] = {};
    for (const [file, entry] of state.files) {
        // Shallow-clone facts, dropping `records` (store already persisted them)
        // and flattening `daily` Map to a record. On reload, reader reuses the
        // entry when mtime is unchanged and re-emits records only if it changes.
        const facts = entry.facts as unknown as { records?: unknown; daily?: Map<string, unknown> };
        const serialized_facts: Record<string, unknown> = { ...facts };
        delete serialized_facts["records"];
        const daily = facts.daily;
        if (daily instanceof Map) {
            serialized_facts["daily"] = Object.fromEntries(daily);
        }
        files[file] = {
            session_id: entry.session_id,
            facts: serialized_facts,
        };
    }
    return { mtimes, files };
}

function deserialize_bucket(bucket: SerializedScanBucket): {
    mtimes: Map<string, number>;
    files: Map<string, { session_id: string; facts: unknown }>;
} {
    const mtimes = new Map<string, number>();
    for (const [file, mtime] of Object.entries(bucket.mtimes ?? {})) {
        mtimes.set(file, mtime);
    }
    const files = new Map<string, { session_id: string; facts: unknown }>();
    for (const [file, entry] of Object.entries(bucket.files ?? {})) {
        const facts = { ...(entry.facts ?? {}) } as Record<string, unknown>;
        // records restored as []: mtime unchanged -> reader reuses entry, no dup.
        facts["records"] = [];
        const daily_raw = facts["daily"];
        const daily_map = new Map<string, unknown>();
        if (daily_raw && typeof daily_raw === "object") {
            for (const [k, v] of Object.entries(daily_raw as Record<string, unknown>)) {
                daily_map.set(k, v);
            }
        }
        facts["daily"] = daily_map;
        files.set(file, { session_id: entry.session_id, facts });
    }
    return { mtimes, files };
}

export function serialize_state(): SerializedScanState {
    const jsonl: Record<string, SerializedScanBucket> = {};
    for (const [key, state] of jsonl_states) jsonl[key] = serialize_bucket(state);
    const kimi: Record<string, SerializedScanBucket> = {};
    for (const [key, state] of kimi_states) kimi[key] = serialize_bucket(state);
    const costs: Record<string, { offset: number; size: number }> = {};
    for (const [key, c] of costs_state) costs[key] = c;
    const opencode: Record<string, number> = {};
    for (const [key, v] of opencode_max_updated) opencode[key] = v;
    return {
        costs_state: costs,
        opencode_max_updated: opencode,
        jsonl_states: jsonl,
        kimi_states: kimi,
    };
}

export async function save_state(state_path: string): Promise<void> {
    if (!state_path) return;
    try {
        await writeJsonAtomic(state_path, serialize_state());
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        forward_log("warn", "collector", `save_state failed: ${msg}`);
    }
}

export async function load_state(state_path: string): Promise<void> {
    if (!state_path) return;
    let text: string;
    try {
        text = await fs.promises.readFile(state_path, "utf8");
    } catch {
        // Missing or unreadable state -> silent fallback to empty (full rescan).
        return;
    }
    // Clear before attempting restore so any parse/deserialize failure leaves
    // the maps empty (full rescan) rather than a half-populated mix.
    costs_state.clear();
    opencode_max_updated.clear();
    jsonl_states.clear();
    kimi_states.clear();
    let parsed: unknown;
    try {
        parsed = JSON.parse(text) as unknown;
    } catch {
        forward_log("warn", "collector", `load_state: corrupt state file, ignoring`);
        return;
    }
    if (typeof parsed !== "object" || parsed === null) return;
    const s = parsed as Partial<SerializedScanState>;
    try {
        if (s.costs_state) {
            for (const [k, v] of Object.entries(s.costs_state)) {
                if (typeof v.offset === "number" && typeof v.size === "number") {
                    costs_state.set(k, { offset: v.offset, size: v.size });
                }
            }
        }
        if (s.opencode_max_updated) {
            for (const [k, v] of Object.entries(s.opencode_max_updated)) {
                if (typeof v === "number") opencode_max_updated.set(k, v);
            }
        }
        if (s.jsonl_states) {
            for (const [k, bucket] of Object.entries(s.jsonl_states)) {
                jsonl_states.set(k, deserialize_bucket(bucket) as unknown as SessionScanState);
            }
        }
        if (s.kimi_states) {
            for (const [k, bucket] of Object.entries(s.kimi_states)) {
                kimi_states.set(k, deserialize_bucket(bucket) as unknown as KimiScanState);
            }
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        forward_log("warn", "collector", `load_state: failed to restore, ignoring: ${msg}`);
        costs_state.clear();
        opencode_max_updated.clear();
        jsonl_states.clear();
        kimi_states.clear();
    }
}

const sources: SourceDef[] = [
    { key: "claude_costs_win", source: "claude_code", kind: "costs", env: "win", wsl: false },
    {
        key: "claude_jsonl_win",
        source: "claude_code",
        kind: "session_jsonl",
        env: "win",
        wsl: false,
    },
    { key: "opencode_win", source: "opencode", kind: "opencode_db", env: "win", wsl: false },
    { key: "kimi_win", source: "kimi_code", kind: "kimi_jsonl", env: "win", wsl: false },
    { key: "claude_costs_wsl", source: "claude_code", kind: "costs", env: "wsl", wsl: true },
    {
        key: "claude_jsonl_wsl",
        source: "claude_code",
        kind: "session_jsonl",
        env: "wsl",
        wsl: true,
    },
    { key: "opencode_wsl", source: "opencode", kind: "opencode_db", env: "wsl", wsl: true },
    { key: "kimi_wsl", source: "kimi_code", kind: "kimi_jsonl", env: "wsl", wsl: true },
];

// --- Path builders ---

/** Injectable for tests: lists directory names under a path. */
type DirLister = (path: string) => string[];

const default_lister: DirLister = (p) => {
    try {
        return fs
            .readdirSync(p, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name);
    } catch {
        return [];
    }
};

let wsl_user_cache: string | null = null;
let wsl_user_cache_distro: string | null = null;

/**
 * Effective WSL user: explicit config wins; otherwise auto-detect as the
 * first home directory under \\wsl.localhost\<distro>\home ("" = unusable).
 */
function effective_wsl_user(cfg: TokenStatsConfig, lister: DirLister = default_lister): string {
    if (cfg.wsl_user !== "") {
        return cfg.wsl_user;
    }
    // Invalidate the cache if the user switched distro (A8) — otherwise the
    // first distro's detected user lingers across update_config and reads the
    // wrong home path.
    if (wsl_user_cache_distro !== cfg.wsl_distro) {
        wsl_user_cache = null;
        wsl_user_cache_distro = cfg.wsl_distro;
    }
    wsl_user_cache ??= lister(`\\\\wsl.localhost\\${cfg.wsl_distro}\\home`)[0] ?? "";
    return wsl_user_cache;
}

function claude_base(cfg: TokenStatsConfig, env: TokenStatsEnv): string {
    if (env === "win") {
        return `${cfg.win_home}\\.claude`;
    }
    return `\\\\wsl.localhost\\${cfg.wsl_distro}\\home\\${effective_wsl_user(cfg)}\\.claude`;
}

function claude_costs_path(cfg: TokenStatsConfig, env: TokenStatsEnv): string {
    return `${claude_base(cfg, env)}\\metrics\\costs.jsonl`;
}

function claude_projects_path(cfg: TokenStatsConfig, env: TokenStatsEnv): string {
    return `${claude_base(cfg, env)}\\projects`;
}

function opencode_path(cfg: TokenStatsConfig, env: TokenStatsEnv): string {
    if (env === "win") {
        return `${cfg.win_home}\\.local\\share\\opencode\\opencode.db`;
    }
    return `\\\\wsl.localhost\\${cfg.wsl_distro}\\home\\${effective_wsl_user(cfg)}\\.local\\share\\opencode\\opencode.db`;
}

function kimi_base(cfg: TokenStatsConfig, env: TokenStatsEnv): string {
    if (env === "win") {
        return `${cfg.win_home}\\.kimi-code`;
    }
    return `\\\\wsl.localhost\\${cfg.wsl_distro}\\home\\${effective_wsl_user(cfg)}\\.kimi-code`;
}

function kimi_sessions_path(cfg: TokenStatsConfig, env: TokenStatsEnv): string {
    return `${kimi_base(cfg, env)}\\sessions`;
}

function kimi_index_path(cfg: TokenStatsConfig, env: TokenStatsEnv): string {
    return `${kimi_base(cfg, env)}\\session_index.jsonl`;
}

// --- Source readers ---

interface SourceReadResult {
    sessions: TokenStatsSessionUpsert[];
    daily: TokenStatsDailyUpsert[];
    records: TokenStatsUpdate["records"];
}

function read_source(src: SourceDef, cfg: TokenStatsConfig): SourceReadResult {
    try {
        if (src.kind === "costs") {
            const s = costs_state.get(src.key) ?? { offset: 0, size: 0 };
            const result = read_costs_jsonl(
                claude_costs_path(cfg, src.env),
                src.env,
                s.offset,
                s.size,
            );
            costs_state.set(src.key, { offset: result.new_offset, size: result.new_size });
            return { sessions: result.sessions, daily: [], records: [] };
        }
        if (src.kind === "session_jsonl") {
            const state = jsonl_states.get(src.key) ?? create_session_scan_state();
            const result = scan_session_jsonls(claude_projects_path(cfg, src.env), src.env, state);
            jsonl_states.set(src.key, result.new_state);
            return { sessions: result.sessions, daily: result.daily, records: result.records };
        }
        if (src.kind === "kimi_jsonl") {
            const state = kimi_states.get(src.key) ?? create_kimi_scan_state();
            const result = scan_kimi_wire_jsonls(
                kimi_sessions_path(cfg, src.env),
                src.env,
                kimi_index_path(cfg, src.env),
                state,
            );
            kimi_states.set(src.key, result.new_state);
            return { sessions: result.sessions, daily: result.daily, records: result.records };
        }
        const max_updated = opencode_max_updated.get(src.key) ?? 0;
        const result = read_opencode_sessions(opencode_path(cfg, src.env), src.env, max_updated);
        for (const session of result.sessions) {
            if (session.ended_at > max_updated) {
                opencode_max_updated.set(src.key, session.ended_at);
            }
        }
        return result;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("ENOENT")) {
            forward_log("error", "collector", `${src.key} read failed: ${msg}`);
        }
        return { sessions: [], daily: [], records: [] };
    }
}

// --- Main collection ---

function collect(): void {
    if (!config) return;

    const all_sessions: TokenStatsSessionUpsert[] = [];
    const all_daily: TokenStatsDailyUpsert[] = [];
    const all_records: TokenStatsUpdate["records"] = [];

    for (const src of sources) {
        if (src.wsl && !config.wsl_enabled) continue;
        const result = read_source(src, config);
        for (const s of result.sessions) {
            if (all_sessions.length >= MAX_RECORDS) break;
            all_sessions.push(s);
        }
        for (const d of result.daily) {
            if (all_daily.length >= MAX_RECORDS * 5) break;
            all_daily.push(d);
        }
        for (const r of result.records) {
            if (all_records.length >= MAX_RECORDS * 20) break;
            all_records.push(r);
        }
        if (
            all_sessions.length >= MAX_RECORDS ||
            all_daily.length >= MAX_RECORDS * 5 ||
            all_records.length >= MAX_RECORDS * 20
        ) {
            forward_log("warn", "collector", "sessions exceed limit, stopping source collection");
            break;
        }
    }

    const update: TokenStatsUpdate = {
        type: "token_stats_update",
        sessions: all_sessions,
        daily: all_daily,
        records: all_records,
    };

    try {
        get_parent_port()?.postMessage(update);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        forward_log("error", "collector", `postMessage failed: ${msg}`);
    }

    // Persist scan state for incremental resume after restart (t114).
    // Fire-and-forget: don't block the next scan on disk IO.
    const state_path = config.state_path;
    if (state_path) void save_state(state_path);
}

// --- Configure (also exported for tests) ---

function configure(cfg: TokenStatsConfig | null): void {
    config = cfg;
    collect();
}

function reset_config(): void {
    config = null;
    costs_state.clear();
    opencode_max_updated.clear();
    jsonl_states.clear();
    kimi_states.clear();
    wsl_user_cache = null;
    wsl_user_cache_distro = null;
    if (interval_id) {
        clearInterval(interval_id);
        interval_id = null;
    }
}

// --- Interval + IPC (only inside the utility process) ---

function start_interval(): void {
    if (!config) return;
    if (interval_id) clearInterval(interval_id);
    interval_id = setInterval(collect, config.poll_interval_ms);
}

const ipc_parent = get_parent_port();
if (ipc_parent) {
    ipc_parent.on("message", (e: { data: unknown }) => {
        const msg = e.data as { type?: string; config?: TokenStatsConfig };
        if (msg.type === "config" && msg.config) {
            const cfg = msg.config;
            // Restore scan state before the first collect so the reader resumes
            // incrementally; then configure + start_interval.
            void load_state(cfg.state_path).then(() => {
                configure(cfg);
                start_interval();
            });
        }
    });
}

// --- Exports for testing ---

export {
    collect,
    configure,
    reset_config,
    costs_state,
    opencode_max_updated,
    jsonl_states,
    kimi_states,
    claude_costs_path,
    claude_projects_path,
    opencode_path,
    kimi_sessions_path,
    kimi_index_path,
    effective_wsl_user,
};
