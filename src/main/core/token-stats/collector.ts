import * as fs from "node:fs";
import * as os from "node:os";
import type {
    TokenStatsConfig,
    TokenStatsDailyUpsert,
    TokenStatsEnv,
    TokenStatsSessionUpsert,
    TokenStatsSource,
    TokenStatsSourceStatus,
    TokenStatsUpdate,
} from "../../../shared/types/token-stats";
import * as paths from "./paths";
import type { Host } from "./paths";
import { read_costs_jsonl, scan_session_jsonls, create_session_scan_state } from "./claude-reader";
import type { SessionScanState } from "./claude-reader";
import { read_opencode_sessions } from "./opencode-reader";
import { scan_kimi_wire_jsonls, create_kimi_scan_state } from "./kimi-reader";
import type { KimiScanState } from "./kimi-reader";
import { scan_grok_updates, create_grok_scan_state } from "./grok-reader";
import type { GrokScanState } from "./grok-reader";
import {
    serialize_state as scan_serialize,
    save_state as scan_save,
    load_state as scan_load,
} from "./scan-state";
import type { SerializedScanState } from "./scan-state";

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
    kind: "costs" | "session_jsonl" | "opencode_db" | "kimi_jsonl" | "grok_jsonl";
    env: TokenStatsEnv;
    /**
     * Hosts that can host this source (t309). The collector filters the
     * declarative list by the host it runs on: a source whose hosts do not
     * include the current host never builds paths or reads — it is reported
     * `unavailable`. WSL data only exists on Windows hosts (UNC share).
     */
    hosts: Host[];
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
const grok_states = new Map<string, GrokScanState>();
// t345 AC-003: 超上限截断游标——该 source 已发出的 session/daily 数。单源
// sessions/daily 总数 > MAX_RECORDS 时，回滚 state 下轮全量重扫，按游标跳过
// 已发出部分，跨轮推进直到发完（避免活锁 + 截断数据不永久丢失）。
const source_cursors = new Map<string, { sessions: number; daily: number }>();
// Warn once per source per process run when its collection round ends
// unavailable or failed (t309). Without this the collector would log every
// poll for users who never install a tool (e.g. grok) or on hosts where a
// source cannot exist (e.g. wsl on linux) — the pre-t309 grok dedup (t197 AC5)
// generalized to every source.
const source_warned = new Set<string>();

// Records the collector has already emitted (by PK source|env|message_id).
// A dirty session re-merge re-derives the session's full record set; without
// this filter every mtime change would re-ship the whole session (observed
// ~200k records/collect on active installs). The set is in-memory only: a
// restart emits full once (same as before), then incrementally. It grows
// monotonically but is bounded by the total distinct message count.
const emitted_record_keys = new Set<string>();

function record_key(r: { source: string; env: string; message_id: string }): string {
    return `${r.source}|${r.env}|${r.message_id}`;
}

// --- Scan-state persistence (t114, extracted to scan-state.ts in t117) ---
//
// serialize/save/load live in scan-state.ts; thin wrappers here read the
// module-level maps and forward log warnings, keeping the public signatures
// stable for tests.

export function serialize_state(): SerializedScanState {
    return scan_serialize({
        costs_state,
        opencode_max_updated,
        jsonl_states,
        kimi_states,
        grok_states,
    });
}

export async function save_state(state_path: string): Promise<void> {
    await scan_save(
        { costs_state, opencode_max_updated, jsonl_states, kimi_states, grok_states },
        state_path,
        (msg) => {
            forward_log("warn", "collector", msg);
        },
    );
}

export async function load_state(state_path: string): Promise<void> {
    await scan_load(
        { costs_state, opencode_max_updated, jsonl_states, kimi_states, grok_states },
        state_path,
        (msg) => {
            forward_log("warn", "collector", msg);
        },
    );
}

const LOCAL_HOSTS: Host[] = ["windows", "linux", "macos"];
const WSL_HOSTS: Host[] = ["windows"];

// Declarative source list (t309): each entry declares the hosts it exists on;
// the collector filters by the host it runs on (AC-001). Local installs exist
// on every host; WSL data (including Grok CLI, which only ships under WSL) is
// a Windows-only UNC share.
const sources: SourceDef[] = [
    {
        key: "claude_costs_local",
        source: "claude_code",
        kind: "costs",
        env: "local",
        hosts: LOCAL_HOSTS,
    },
    {
        key: "claude_jsonl_local",
        source: "claude_code",
        kind: "session_jsonl",
        env: "local",
        hosts: LOCAL_HOSTS,
    },
    {
        key: "opencode_local",
        source: "opencode",
        kind: "opencode_db",
        env: "local",
        hosts: LOCAL_HOSTS,
    },
    {
        key: "kimi_local",
        source: "kimi_code",
        kind: "kimi_jsonl",
        env: "local",
        hosts: LOCAL_HOSTS,
    },
    { key: "claude_costs_wsl", source: "claude_code", kind: "costs", env: "wsl", hosts: WSL_HOSTS },
    {
        key: "claude_jsonl_wsl",
        source: "claude_code",
        kind: "session_jsonl",
        env: "wsl",
        hosts: WSL_HOSTS,
    },
    { key: "opencode_wsl", source: "opencode", kind: "opencode_db", env: "wsl", hosts: WSL_HOSTS },
    { key: "kimi_wsl", source: "kimi_code", kind: "kimi_jsonl", env: "wsl", hosts: WSL_HOSTS },
    // Grok CLI data exists only under WSL (~/.grok/sessions).
    { key: "grok_wsl", source: "grok", kind: "grok_jsonl", env: "wsl", hosts: WSL_HOSTS },
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
    // t345 AC-006: 空结果不缓存（`??=` 会缓存 ""，整段运行期 WSL 源不可用）。
    // 只有探测到非空用户才写缓存；每轮空结果重试探测。
    if (wsl_user_cache === null) {
        const detected = lister(`\\\\wsl.localhost\\${cfg.wsl_distro}\\home`)[0];
        if (detected) wsl_user_cache = detected;
    }
    return wsl_user_cache ?? "";
}

/** Host the collector runs on, derived from process.platform (t308). */
let collector_host: Host = paths.host_from_platform(process.platform);

/**
 * Test-only injection: the path layer is a pure function of (host, env, cfg),
 * so tests simulate any host by overriding this. Production never calls it —
 * the host is fixed at module load from process.platform.
 */
export function set_collector_host(host: Host): void {
    collector_host = host;
}

function path_input(
    cfg: TokenStatsConfig,
    host: Host = collector_host,
    homedir: string = os.homedir(),
): paths.TokenStatsPathInput {
    return {
        host,
        homedir,
        win_home: cfg.win_home,
        wsl_distro: cfg.wsl_distro,
        wsl_user: effective_wsl_user(cfg),
    };
}

function claude_costs_path(
    cfg: TokenStatsConfig,
    env: TokenStatsEnv,
    host: Host = collector_host,
    homedir: string = os.homedir(),
): string | null {
    return paths.claude_costs_path(path_input(cfg, host, homedir), env);
}

function claude_projects_path(
    cfg: TokenStatsConfig,
    env: TokenStatsEnv,
    host: Host = collector_host,
    homedir: string = os.homedir(),
): string | null {
    return paths.claude_projects_path(path_input(cfg, host, homedir), env);
}

function opencode_path(
    cfg: TokenStatsConfig,
    env: TokenStatsEnv,
    host: Host = collector_host,
    homedir: string = os.homedir(),
): string | null {
    return paths.opencode_path(path_input(cfg, host, homedir), env);
}

function kimi_sessions_path(
    cfg: TokenStatsConfig,
    env: TokenStatsEnv,
    host: Host = collector_host,
    homedir: string = os.homedir(),
): string | null {
    return paths.kimi_sessions_path(path_input(cfg, host, homedir), env);
}

function kimi_index_path(
    cfg: TokenStatsConfig,
    env: TokenStatsEnv,
    host: Host = collector_host,
    homedir: string = os.homedir(),
): string | null {
    return paths.kimi_index_path(path_input(cfg, host, homedir), env);
}

function grok_sessions_path(
    cfg: TokenStatsConfig,
    host: Host = collector_host,
    homedir: string = os.homedir(),
): string | null {
    return paths.grok_sessions_path(path_input(cfg, host, homedir), "wsl");
}

// --- Source readers ---

/** Result of one source's collection round, extended with its status (t309). */
interface SourceReadResult {
    sessions: TokenStatsSessionUpsert[];
    daily: TokenStatsDailyUpsert[];
    records: TokenStatsUpdate["records"];
}

interface SourceOutcome extends SourceReadResult {
    status: "ok" | "unavailable" | "failed";
    /** Reason for unavailable/failed; absent for ok (AC-002). */
    lastError?: string;
    /**
     * Exact warn text for this round (AC-003). Built where the reason is known
     * so the established phrasings (e.g. grok's "sessions dir missing") are
     * preserved; the collector emits it at most once per source per run.
     */
    logMessage?: string;
}

const EMPTY_READ: SourceReadResult = { sessions: [], daily: [], records: [] };

function read_source(src: SourceDef, cfg: TokenStatsConfig): SourceOutcome {
    try {
        if (src.kind === "costs") {
            const costs_path = claude_costs_path(cfg, src.env);
            if (costs_path === null) {
                return { ...EMPTY_READ, status: "unavailable", lastError: "path unavailable" };
            }
            const s = costs_state.get(src.key) ?? { offset: 0, size: 0 };
            const result = read_costs_jsonl(costs_path, src.env, s.offset, s.size);
            costs_state.set(src.key, { offset: result.new_offset, size: result.new_size });
            return {
                sessions: result.sessions,
                daily: [],
                records: [],
                status: "ok",
            };
        }
        if (src.kind === "session_jsonl") {
            const projects_path = claude_projects_path(cfg, src.env);
            if (projects_path === null) {
                return { ...EMPTY_READ, status: "unavailable", lastError: "path unavailable" };
            }
            const state = jsonl_states.get(src.key) ?? create_session_scan_state();
            const result = scan_session_jsonls(projects_path, src.env, state);
            jsonl_states.set(src.key, result.new_state);
            return {
                sessions: result.sessions,
                daily: result.daily,
                records: result.records,
                status: "ok",
            };
        }
        if (src.kind === "kimi_jsonl") {
            const sessions_path = kimi_sessions_path(cfg, src.env);
            const index_path = kimi_index_path(cfg, src.env);
            if (sessions_path === null || index_path === null) {
                return { ...EMPTY_READ, status: "unavailable", lastError: "path unavailable" };
            }
            const state = kimi_states.get(src.key) ?? create_kimi_scan_state();
            const result = scan_kimi_wire_jsonls(sessions_path, src.env, index_path, state);
            kimi_states.set(src.key, result.new_state);
            return {
                sessions: result.sessions,
                daily: result.daily,
                records: result.records,
                status: "ok",
            };
        }
        if (src.kind === "grok_jsonl") {
            const grok_path = grok_sessions_path(cfg);
            if (grok_path === null) {
                return { ...EMPTY_READ, status: "unavailable", lastError: "path unavailable" };
            }
            const state = grok_states.get(src.key) ?? create_grok_scan_state();
            const result = scan_grok_updates(grok_path, src.env, state);
            grok_states.set(src.key, result.new_state);
            if (result.missing) {
                // 目录缺失（t197 AC5）：unavailable，保留 established warn 文案。
                const lastError = `sessions dir missing: ${grok_path}`;
                return {
                    ...EMPTY_READ,
                    status: "unavailable",
                    lastError,
                    logMessage: `${src.key} ${lastError}`,
                };
            }
            if (result.file_unreadable) {
                // t345 AC-001: 部分文件不可读——返回已解析部分，报 failed（非丢弃）。
                return {
                    sessions: result.sessions,
                    daily: result.daily,
                    records: result.records,
                    status: "failed",
                    lastError: "some grok session files unreadable",
                    logMessage: `${src.key} partially unreadable: some session files unreadable`,
                };
            }
            return {
                sessions: result.sessions,
                daily: result.daily,
                records: result.records,
                status: "ok",
            };
        }
        const opencode_db_path = opencode_path(cfg, src.env);
        if (opencode_db_path === null) {
            return { ...EMPTY_READ, status: "unavailable", lastError: "path unavailable" };
        }
        const max_updated = opencode_max_updated.get(src.key) ?? 0;
        const result = read_opencode_sessions(opencode_db_path, src.env, max_updated);
        for (const session of result.sessions) {
            if (session.ended_at > max_updated) {
                opencode_max_updated.set(src.key, session.ended_at);
            }
        }
        return { ...result, status: "ok" };
    } catch (err: unknown) {
        // t309: previously ENOENT failures were silent and non-ENOENT failures
        // logged at error level; both now surface as a per-source warn.
        const msg = err instanceof Error ? err.message : String(err);
        return {
            ...EMPTY_READ,
            status: "failed",
            lastError: msg,
            logMessage: `${src.key} read failed: ${msg}`,
        };
    }
}

// --- Main collection ---

/** Emit a warn log for an unavailable/failed source, at most once per source
 *  per process run (AC-003; extends the t197 grok dedup to every source). */
function warn_source(src: SourceDef, message: string): void {
    if (source_warned.has(src.key)) return;
    source_warned.add(src.key);
    forward_log("warn", "collector", message);
}

function collect(): void {
    if (!config) return;

    const all_sessions: TokenStatsSessionUpsert[] = [];
    const all_daily: TokenStatsDailyUpsert[] = [];
    const all_records: TokenStatsUpdate["records"] = [];
    // Per-source status of this round (AC-002): every participating source is
    // reported; unavailable/failed entries carry the reason text.
    const all_sources_status: TokenStatsSourceStatus[] = [];

    // t345 AC-004: 本轮新增的 emitted 标记先存临时集合，postMessage 成功才并入
    // emitted_record_keys——发送失败时回滚，下一轮重发。
    const newly_emitted: string[] = [];
    // 参与读取的 source（postMessage 失败时回滚其扫描状态，下轮重扫重发）。
    const participated: SourceDef[] = [];
    // 超上限触发截断的 source（不 break 饿死后续 source）。
    const truncated_sources: SourceDef[] = [];
    for (const src of sources) {
        // Config-disabled sources (wsl_enabled=false) do not participate at
        // all — no read, no status entry (an intentional config choice, not an
        // availability problem).
        if (src.env === "wsl" && !config.wsl_enabled) continue;
        // Declarative host filter (AC-001): sources that cannot exist on this
        // host never build paths or read; they are reported unavailable.
        if (!src.hosts.includes(collector_host)) {
            const lastError = `wsl data requires a windows host (host=${collector_host})`;
            warn_source(src, `${src.key} unavailable: ${lastError}`);
            all_sources_status.push({
                source: src.source,
                env: src.env,
                status: "unavailable",
                lastError,
            });
            continue;
        }
        const result = read_source(src, config);
        participated.push(src);
        if (result.status === "ok") {
            all_sources_status.push({ source: src.source, env: src.env, status: "ok" });
        } else {
            const lastError = result.lastError ?? result.status;
            warn_source(src, result.logMessage ?? `${src.key} ${result.status}: ${lastError}`);
            all_sources_status.push({
                source: src.source,
                env: src.env,
                status: result.status,
                lastError,
            });
        }
        // t345 AC-003: 截断游标——跳过该 source 已发出的前 N 个 session/daily
        // （reader 按 session_id 排序，游标推进保证跨轮不重发也不丢失）。
        const cursor = source_cursors.get(src.key);
        let skipped_sessions = 0;
        let skipped_daily = 0;
        let pushed_sessions = 0;
        let pushed_daily = 0;
        for (const s of result.sessions) {
            if (cursor && skipped_sessions < cursor.sessions) {
                skipped_sessions++;
                continue;
            }
            if (all_sessions.length >= MAX_RECORDS) break;
            all_sessions.push(s);
            pushed_sessions++;
        }
        for (const d of result.daily) {
            if (cursor && skipped_daily < cursor.daily) {
                skipped_daily++;
                continue;
            }
            if (all_daily.length >= MAX_RECORDS * 5) break;
            all_daily.push(d);
            pushed_daily++;
        }
        for (const r of result.records) {
            const key = record_key(r);
            if (emitted_record_keys.has(key)) continue;
            // Capacity check BEFORE marking emitted: a break here must leave the
            // key unseen so the next collect retries it, otherwise a record that
            // hit the cap would be silently dropped forever (it is marked emitted
            // but never written to the DB).
            if (all_records.length >= MAX_RECORDS * 20) break;
            newly_emitted.push(key);
            all_records.push(r);
        }
        if (
            all_sessions.length >= MAX_RECORDS ||
            all_daily.length >= MAX_RECORDS * 5 ||
            all_records.length >= MAX_RECORDS * 20
        ) {
            // t345 AC-003: 超上限截断——记录游标（跳过的已发出数 + 本轮新收集数
            // = 累计已发出计数），回滚该 source 的扫描状态使下轮全量重扫，按游标
            // 推进跨轮发完截断数据。
            const total_sessions = skipped_sessions + pushed_sessions;
            const total_daily = skipped_daily + pushed_daily;
            source_cursors.set(src.key, { sessions: total_sessions, daily: total_daily });
            for (const map of [
                costs_state,
                opencode_max_updated,
                jsonl_states,
                kimi_states,
                grok_states,
            ] as const) {
                map.delete(src.key);
            }
            truncated_sources.push(src);
        } else if (cursor) {
            // 未截断：游标已消费完，清除。
            source_cursors.delete(src.key);
        }
    }

    const update: TokenStatsUpdate = {
        type: "token_stats_update",
        sessions: all_sessions,
        daily: all_daily,
        records: all_records,
        sources_status: all_sources_status,
    };

    try {
        get_parent_port()?.postMessage(update);
        for (const key of newly_emitted) {
            emitted_record_keys.add(key);
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        forward_log("error", "collector", `postMessage failed: ${msg}`);
        // t345 AC-004: postMessage 失败——回滚参与 source 的扫描状态与截断游标，
        // 下一轮全量重扫并重发（否则增量 reader 不重产出失败轮 records，数据静默
        // 丢失；截断轮若游标不回滚，被跳过 session upsert 永久缺失）。
        for (const src of participated) {
            for (const map of [
                costs_state,
                opencode_max_updated,
                jsonl_states,
                kimi_states,
                grok_states,
            ] as const) {
                map.delete(src.key);
            }
            source_cursors.delete(src.key);
        }
    }

    if (truncated_sources.length > 0) {
        forward_log("warn", "collector", "sessions exceed limit, stopping source collection");
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
    grok_states.clear();
    source_warned.clear();
    emitted_record_keys.clear();
    source_cursors.clear();
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
    grok_states,
    source_cursors,
    claude_costs_path,
    claude_projects_path,
    opencode_path,
    kimi_sessions_path,
    kimi_index_path,
    grok_sessions_path,
    effective_wsl_user,
};
