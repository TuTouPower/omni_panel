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

let config: TokenStatsConfig | null = null;
let interval_id: ReturnType<typeof setInterval> | null = null;

const costs_state = new Map<string, CostsState>();
const opencode_max_updated = new Map<string, number>();
const jsonl_states = new Map<string, SessionScanState>();
const kimi_states = new Map<string, KimiScanState>();

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

/**
 * Effective WSL user: explicit config wins; otherwise auto-detect as the
 * first home directory under \\wsl.localhost\<distro>\home ("" = unusable).
 */
function effective_wsl_user(cfg: TokenStatsConfig, lister: DirLister = default_lister): string {
    if (cfg.wsl_user !== "") {
        return cfg.wsl_user;
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
            console.error(`[collector] ${src.key} read failed:`, msg);
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
            console.warn("[collector] sessions exceed limit, stopping source collection");
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
        console.error("[collector] postMessage failed:", msg);
    }
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
            configure(msg.config);
            start_interval();
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
    claude_costs_path,
    claude_projects_path,
    opencode_path,
    kimi_sessions_path,
    kimi_index_path,
    effective_wsl_user,
};
