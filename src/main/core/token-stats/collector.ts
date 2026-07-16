import type {
    TokenStatsConfig,
    TokenStatsSession,
    TokenStatsUpdate,
    TokenStatsEnv,
    TokenStatsSource,
} from "../../../shared/types/token-stats";
import { read_costs_jsonl } from "./claude-reader";
import { read_opencode_sessions } from "./opencode-reader";
import { aggregate_sessions } from "./aggregator";

// --- Constants ---

const MAX_RECORDS = 10000;

// --- Types ---

interface SourceState {
    offset: number;
    size: number;
    max_updated: number;
}

interface SourceDef {
    key: string;
    source: TokenStatsSource;
    env: TokenStatsEnv;
    wsl: boolean;
}

// --- Module state ---

let config: TokenStatsConfig | null = null;

const state = new Map<string, SourceState>();

const sources: SourceDef[] = [
    { key: "claude_win", source: "claude_code", env: "win", wsl: false },
    { key: "opencode_win", source: "opencode", env: "win", wsl: false },
    { key: "claude_wsl", source: "claude_code", env: "wsl", wsl: true },
    { key: "opencode_wsl", source: "opencode", env: "wsl", wsl: true },
];

// --- Path builders ---

function claude_path(cfg: TokenStatsConfig, env: TokenStatsEnv): string {
    if (env === "win") {
        return `${cfg.win_home}\\.claude\\metrics\\costs.jsonl`;
    }
    return `\\\\wsl.localhost\\${cfg.wsl_distro}\\home\\${cfg.wsl_user}\\.claude\\metrics\\costs.jsonl`;
}

function opencode_path(cfg: TokenStatsConfig, env: TokenStatsEnv): string {
    if (env === "win") {
        return `${cfg.win_home}\\.local\\share\\opencode\\opencode.db`;
    }
    return `\\\\wsl.localhost\\${cfg.wsl_distro}\\home\\${cfg.wsl_user}\\.local\\share\\opencode\\opencode.db`;
}

// --- Source readers ---

function read_claude_source(
    file_path: string,
    env: TokenStatsEnv,
    s: SourceState,
): TokenStatsSession[] {
    try {
        const result = read_costs_jsonl(file_path, env, s.offset, s.size);
        s.offset = result.new_offset;
        s.size = result.new_size;
        return result.sessions;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("ENOENT")) {
            console.error(`[collector] claude read failed (${env}):`, msg);
        }
        return [];
    }
}

function read_opencode_source(
    db_path: string,
    env: TokenStatsEnv,
    s: SourceState,
): TokenStatsSession[] {
    try {
        const sessions = read_opencode_sessions(db_path, env, s.max_updated);
        for (const session of sessions) {
            if (session.ended_at > s.max_updated) {
                s.max_updated = session.ended_at;
            }
        }
        return sessions;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[collector] opencode read failed (${env}):`, msg);
        return [];
    }
}

// --- Main collection ---

function collect(): void {
    if (!config) return;

    const all_sessions: TokenStatsSession[] = [];

    for (const src of sources) {
        if (src.wsl && !config.wsl_enabled) continue;

        let s = state.get(src.key);
        if (!s) {
            s = { offset: 0, size: 0, max_updated: 0 };
            state.set(src.key, s);
        }

        const path_builder = src.source === "claude_code" ? claude_path : opencode_path;
        const file_path = path_builder(config, src.env);

        const sessions =
            src.source === "claude_code"
                ? read_claude_source(file_path, src.env, s)
                : read_opencode_source(file_path, src.env, s);

        all_sessions.push(...sessions);
    }

    const { buckets, sessions } = aggregate_sessions(all_sessions);

    if (sessions.length > MAX_RECORDS) {
        console.warn(
            `[collector] sessions (${String(sessions.length)}) exceed limit ${String(MAX_RECORDS)}, truncating`,
        );
        sessions.length = MAX_RECORDS;
    }

    const update: TokenStatsUpdate = {
        type: "token_stats_update",
        buckets,
        sessions,
    };

    try {
        process.send?.(update);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[collector] process.send failed:", msg);
    }
}

// --- Configure for testing ---

function configure(cfg: TokenStatsConfig | null): void {
    config = cfg;
    collect();
}

// --- IPC ---

process.on("message", (msg: { type?: string; config?: TokenStatsConfig }) => {
    if (msg.type === "config" && msg.config) {
        configure(msg.config);
    }
});

// --- Interval ---

let interval_id: ReturnType<typeof setInterval> | null = null;

function start_interval(): void {
    if (!config) return;
    if (interval_id) clearInterval(interval_id);
    interval_id = setInterval(collect, config.poll_interval_ms);
}

process.on("message", (msg: { type?: string }) => {
    if (msg.type === "config") start_interval();
});

// --- Exports for testing ---

function reset_config(): void {
    config = null;
}

export { collect, configure, reset_config, state, claude_path, opencode_path };
