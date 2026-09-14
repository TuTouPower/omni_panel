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
import { default_win_home_deps, discover_win_home } from "./win-home-discovery";
import type { WinHomeDiscoveryDeps } from "./win-home-discovery";
import { read_costs_jsonl, scan_session_jsonls, create_session_scan_state } from "./claude-reader";
import type { SessionScanState } from "./claude-reader";
import { read_opencode_sessions } from "./opencode-reader";
import { scan_kimi_wire_jsonls, create_kimi_scan_state } from "./kimi-reader";
import type { KimiScanState } from "./kimi-reader";
import { scan_grok_updates, create_grok_scan_state } from "./grok-reader";
import type { GrokScanState } from "./grok-reader";
import { scan_codex_rollouts, create_codex_scan_state } from "./codex-reader";
import type { CodexScanState } from "./codex-reader";
import { scan_commandcode_jsonls, create_commandcode_scan_state } from "./commandcode-reader";
import type { CommandCodeScanState } from "./commandcode-reader";
import { scan_antigravity_sessions, create_antigravity_scan_state } from "./antigravity-reader";
import type { AntigravityScanState } from "./antigravity-reader";
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
    kind:
        | "costs"
        | "session_jsonl"
        | "opencode_db"
        | "kimi_jsonl"
        | "grok_jsonl"
        | "codex_jsonl"
        | "commandcode_jsonl"
        | "antigravity_index";
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
const codex_states = new Map<string, CodexScanState>();
const commandcode_states = new Map<string, CommandCodeScanState>();
const antigravity_states = new Map<string, AntigravityScanState>();
// t345 AC-003 + t385 AC-001/002: 超上限截断游标——该 source 已发出的
// session/daily **身份键**集合（非排序位置计数，防新会话排序在游标前被误跳）。
// 入 scan-state 持久化，跨重启保留推进进度。回滚 state 下轮全量重扫，按
// 游标跳过已发出部分，跨轮推进直到发完。
const source_cursors = new Map<string, { sessions: Set<string>; daily: Set<string> }>();
// Warn once per source per process run when its collection round ends
// unavailable or failed (t309). Without this the collector would log every
// poll for users who never install a tool (e.g. grok) or on hosts where a
// source cannot exist (e.g. wsl on linux) — the pre-t309 grok dedup (t197 AC5)
// generalized to every source.
const source_warned = new Set<string>();

// Records the collector has already emitted (by PK source|env|message_id).
// A dirty session re-merge re-derives the session's full record set; without
// this filter every mtime change would re-ship the whole session (observed
// ~200k records/collect on active installs). The map is in-memory only: a
// restart emits full once (same as before), then incrementally. t346 AC-001:
// 记录加入时间戳，按 EMITTED_WINDOW_MS 裁剪，内存占用不再随历史消息总量
// 线性增长（只保留近 N 天去重状态）。窗口取 30 天：覆盖绝大多数增量回溯期，
// 活跃会话过窗重发概率被压到「会话 >30 天未触碰又被触碰」的罕见场景。
const EMITTED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const emitted_record_keys = new Map<string, number>();
// t386 AC-001: 会话最近触碰时间（mtime 更新时刷新）。prune_emitted 用它保留
// 「窗口内活跃会话」的 key——活跃长会话 >30 天持续触碰时 key 不被整体裁剪，
// 下次 mtime 变化只发新增记录，不重发整段历史。
const session_touch_ts = new Map<string, number>();

function record_key(r: {
    source: string;
    env: string;
    session_id: string;
    message_id: string;
}): string {
    return `${r.source}|${r.env}|${r.session_id}|${r.message_id}`;
}

/** 裁剪超出时间窗的已发出记录（collect 时调用）。
 *  t386 AC-001/002: key 过窗但其会话在窗口内活跃（持续触碰）→ 保留并刷新 ts；
 *  非活跃会话（>30 天未触碰）过窗 key 删除，重触碰时整段重发（既有语义不变）。 */
function prune_emitted(now: number = Date.now()): void {
    for (const [key, ts] of emitted_record_keys) {
        if (now - ts <= EMITTED_WINDOW_MS) continue;
        // key 格式 source|env|session_id|message_id；touch 键 source|env|session_id。
        const parts = key.split("|");
        const session_key = `${parts[0] ?? ""}|${parts[1] ?? ""}|${parts[2] ?? ""}`;
        const session_touch = session_touch_ts.get(session_key);
        if (session_touch !== undefined && now - session_touch <= EMITTED_WINDOW_MS) {
            // 活跃会话：key 保留并刷新时间戳，避免下次整段重发。
            emitted_record_keys.set(key, now);
            continue;
        }
        emitted_record_keys.delete(key);
    }
    // t386: 同步清理过窗会话的 touch 记录，防内存线性增长。
    for (const [session, ts] of session_touch_ts) {
        if (now - ts > EMITTED_WINDOW_MS) {
            session_touch_ts.delete(session);
        }
    }
}

/** 记录是否本轮发出（去重判定）。
 *  t393 AC-003: 过窗且会话不活跃（>30 天未触碰）的 key 视为未 emit 本轮即重发，
 *  不延迟一轮；窗口内或活跃会话 key 跳过（活跃 key 顺带保活刷新 ts，防整段重发）。
 *  touch 就绪性：在本 source 的 records 循环内调用时，本 source 的会话 touch
 *  已刷新（见 collect 源循环），跨源 key 不受影响。 */
function should_emit_record(key: string, now: number = Date.now()): boolean {
    const ts = emitted_record_keys.get(key);
    if (ts === undefined) return true;
    if (now - ts <= EMITTED_WINDOW_MS) return false;
    const parts = key.split("|");
    const session_key = `${parts[0] ?? ""}|${parts[1] ?? ""}|${parts[2] ?? ""}`;
    const session_touch = session_touch_ts.get(session_key);
    if (session_touch !== undefined && now - session_touch <= EMITTED_WINDOW_MS) {
        emitted_record_keys.set(key, now);
        return false;
    }
    return true;
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
        codex_states,
        commandcode_states,
        antigravity_states,
        source_cursors,
    });
}

export async function save_state(state_path: string): Promise<void> {
    await scan_save(
        {
            costs_state,
            opencode_max_updated,
            jsonl_states,
            kimi_states,
            grok_states,
            codex_states,
            commandcode_states,
            antigravity_states,
            source_cursors,
        },
        state_path,
        (msg) => {
            forward_log("warn", "collector", msg);
        },
    );
}

export async function load_state(state_path: string): Promise<void> {
    await scan_load(
        {
            costs_state,
            opencode_max_updated,
            jsonl_states,
            kimi_states,
            grok_states,
            codex_states,
            commandcode_states,
            antigravity_states,
            source_cursors,
        },
        state_path,
        (msg) => {
            forward_log("warn", "collector", msg);
        },
    );
}

const WSL_HOSTS: Host[] = ["windows"];

/** t437: 宿主 → 本机平台源 env 标签（替代 pre-t437 的 `local`）。 */
const PLATFORM_ENV_BY_HOST: Record<Host, "win" | "linux" | "mac"> = {
    windows: "win",
    linux: "linux",
    macos: "mac",
};

/**
 * t437: 平台源定义按当前宿主生成——每宿主只存在一个平台变体，key 与平台
 * 标签一致（windows 宿主 `claude_costs_win`，linux `claude_costs_linux`，
 * macos `claude_costs_mac`），env=对应平台值。替代 pre-t437 的静态平台源
 *（`local` 语义 = 「进程所在 OS」已废止）。
 */
function platform_source_defs(host: Host): SourceDef[] {
    const env = PLATFORM_ENV_BY_HOST[host];
    return [
        { key: `claude_costs_${env}`, source: "claude_code", kind: "costs", env, hosts: [host] },
        {
            key: `claude_jsonl_${env}`,
            source: "claude_code",
            kind: "session_jsonl",
            env,
            hosts: [host],
        },
        { key: `opencode_${env}`, source: "opencode", kind: "opencode_db", env, hosts: [host] },
        { key: `kimi_${env}`, source: "kimi_code", kind: "kimi_jsonl", env, hosts: [host] },
        // t426: grok CLI 也随宿主安装在 linux/mac 本机（~/.grok/sessions）；
        // Windows 上 grok CLI 仅存在于 WSL（UNC，grok_wsl），平台源在 Windows
        // 无数据时按 missing 处理。两 env 并存时 store 主键 (source,env,id) 区分。
        { key: `grok_${env}`, source: "grok", kind: "grok_jsonl", env, hosts: [host] },
        // t445: codex 数据仅本机 ~/.codex（无 wsl 对侧），随宿主平台源采集。
        { key: `codex_${env}`, source: "codex", kind: "codex_jsonl", env, hosts: [host] },
        // t483: Command Code is local linux/mac only. Windows and WSL path
        // shapes remain outside this task's contract.
        ...(host === "windows"
            ? []
            : [
                  {
                      key: `commandcode_${env}`,
                      source: "commandcode" as TokenStatsSource,
                      kind: "commandcode_jsonl" as const,
                      env,
                      hosts: [host],
                  },
              ]),
        // t470: antigravity 会话发现仅本机索引（无用量 records；代理面板不接，
        // AC-004）。随宿主平台源采集，与 codex 同形。
        {
            key: `antigravity_${env}`,
            source: "antigravity",
            kind: "antigravity_index",
            env,
            hosts: [host],
        },
    ];
}

// WSL 数据是 Windows-only UNC share；非 Windows 宿主按 hosts 过滤报 unavailable
// （既有行为，t437 不变）。
const WSL_SOURCES: SourceDef[] = [
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
    // Grok CLI data exists only under WSL (~/.grok/sessions); 平台源见上方
    // grok_<platform>（Linux/mac 宿主本机采集，t426）。
    { key: "grok_wsl", source: "grok", kind: "grok_jsonl", env: "wsl", hosts: WSL_HOSTS },
];

/**
 * t438: WSL/Linux 宿主上的 Windows 侧数据源（env=win，hosts=["linux"]）——
 * 经 /mnt/c/Users 自动发现 Windows 用户 home 后采集，与 Windows 宿主的平台
 * win 源（hosts=["windows"]）同名同义不同宿主，hosts 过滤保证同一宿主上
 * 只有一方参与（key 不冲突）。发现失败时 win_home_wsl=null → 路径解析 null
 * → 源报 unavailable（AC-005），linux/mac local 侧照常。
 */
const WIN_SOURCES_LINUX: SourceDef[] = [
    { key: "claude_costs_win", source: "claude_code", kind: "costs", env: "win", hosts: ["linux"] },
    {
        key: "claude_jsonl_win",
        source: "claude_code",
        kind: "session_jsonl",
        env: "win",
        hosts: ["linux"],
    },
    { key: "opencode_win", source: "opencode", kind: "opencode_db", env: "win", hosts: ["linux"] },
    { key: "kimi_win", source: "kimi_code", kind: "kimi_jsonl", env: "win", hosts: ["linux"] },
    { key: "grok_win", source: "grok", kind: "grok_jsonl", env: "win", hosts: ["linux"] },
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
 * t437: 采集源清单 = 当前宿主的平台五源 + 静态 WSL 五源。平台源按宿主派生，
 * 保证任何宿主上只有一个平台变体参与采集（sources_status 不新增噪音）。
 * t438: linux 宿主额外挂 Windows 侧五源（env=win，hosts=["linux"]）——
 * 经 /mnt/c/Users 自动发现 Windows home 采集，与 Windows 宿主平台 win 源
 * 不共存（hosts 过滤）。
 */
let sources: SourceDef[] = [
    ...platform_source_defs(collector_host),
    ...(collector_host === "linux" ? WIN_SOURCES_LINUX : []),
    ...WSL_SOURCES,
];

/**
 * Test-only injection: the path layer is a pure function of (host, env, cfg),
 * so tests simulate any host by overriding this. Production never calls it —
 * the host is fixed at module load from process.platform. t437: 平台源定义
 * 随宿主重建（key/env 与平台标签一致）。t438: linux 宿主同时挂 win 五源。
 */
export function set_collector_host(host: Host): void {
    collector_host = host;
    sources = [
        ...platform_source_defs(host),
        ...(host === "linux" ? WIN_SOURCES_LINUX : []),
        ...WSL_SOURCES,
    ];
}

// --- Windows home discovery (t438) ---

let win_home_wsl_cache: string | null = null;
/** 本轮 collect 是否已探测：null 结果也缓存到本轮结束（避免一轮内每源重探、
 *  零候选时反复 spawn powershell）；下一轮开头复位重探，挂载恢复自愈
 *  （review test_f001：对齐 effective_wsl_user「失败不长期缓存」语义，粒度=轮）。 */
let win_home_wsl_probed_this_round = false;
/** Test-only probe override: replaces discover_win_home(default deps). */
let win_home_wsl_probe: ((deps: WinHomeDiscoveryDeps) => string | null) | null = null;

/**
 * Test-only injection: probe 覆盖发现逻辑（tests 注入桩避免真实 /mnt/c 与
 * powershell.exe）。Production never calls it — the default probes the real
 * /mnt/c/Users. 替换 probe 时同时清缓存（发现结果进程内缓存对齐
 * effective_wsl_user 模式；配置重载经 reset_config 清缓存）。
 */
function set_win_home_wsl_probe(
    probe: ((deps: WinHomeDiscoveryDeps) => string | null) | null,
): void {
    win_home_wsl_probe = probe;
    win_home_wsl_cache = null;
    win_home_wsl_probed_this_round = false;
}

/**
 * Effective Windows home on a linux host: auto-discovered once and cached;
 * null result is cached only for the current collect round so a transient
 * failure self-heals next round (aligns effective_wsl_user, t345 AC-006 语义).
 * Non-linux hosts → null.
 */
function effective_win_home_wsl(host: Host): string | null {
    if (host !== "linux") {
        return null;
    }
    if (!win_home_wsl_probed_this_round) {
        win_home_wsl_probed_this_round = true;
        const discovery_deps: WinHomeDiscoveryDeps = {
            ...default_win_home_deps,
            // t438 review f003：多候选取舍 / shell 回退等关键分支留痕。
            on_decision: (message) => {
                forward_log("warn", "collector", message);
            },
        };
        win_home_wsl_cache = (win_home_wsl_probe ?? discover_win_home)(discovery_deps);
    }
    return win_home_wsl_cache;
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
        win_home_wsl: effective_win_home_wsl(host),
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

function codex_sessions_path(
    cfg: TokenStatsConfig,
    env: TokenStatsEnv,
    host: Host = collector_host,
    homedir: string = os.homedir(),
): string | null {
    return paths.codex_sessions_path(path_input(cfg, host, homedir), env);
}

function commandcode_projects_path(
    cfg: TokenStatsConfig,
    env: TokenStatsEnv,
    host: Host = collector_host,
    homedir: string = os.homedir(),
): string | null {
    return paths.commandcode_projects_path(path_input(cfg, host, homedir), env);
}

function grok_sessions_path(
    cfg: TokenStatsConfig,
    env: TokenStatsEnv,
    host: Host = collector_host,
    homedir: string = os.homedir(),
): string | null {
    return paths.grok_sessions_path(path_input(cfg, host, homedir), env);
}

function antigravity_conversations_path(
    cfg: TokenStatsConfig,
    env: TokenStatsEnv,
    host: Host = collector_host,
    homedir: string = os.homedir(),
): string | null {
    return paths.antigravity_conversations_path(path_input(cfg, host, homedir), env);
}

function antigravity_summaries_path(
    cfg: TokenStatsConfig,
    env: TokenStatsEnv,
    host: Host = collector_host,
    homedir: string = os.homedir(),
): string | null {
    return paths.antigravity_summaries_path(path_input(cfg, host, homedir), env);
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
            const grok_path = grok_sessions_path(cfg, src.env);
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
        if (src.kind === "codex_jsonl") {
            const codex_path = codex_sessions_path(cfg, src.env);
            if (codex_path === null) {
                return { ...EMPTY_READ, status: "unavailable", lastError: "path unavailable" };
            }
            const state = codex_states.get(src.key) ?? create_codex_scan_state();
            const result = scan_codex_rollouts(codex_path, src.env, state);
            codex_states.set(src.key, result.new_state);
            if (result.missing) {
                const lastError = `sessions dir missing: ${codex_path}`;
                return {
                    ...EMPTY_READ,
                    status: "unavailable",
                    lastError,
                    logMessage: `${src.key} ${lastError}`,
                };
            }
            if (result.file_unreadable) {
                return {
                    sessions: result.sessions,
                    daily: result.daily,
                    records: result.records,
                    status: "failed",
                    lastError: "some codex session files unreadable",
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
        if (src.kind === "commandcode_jsonl") {
            const projects_path = commandcode_projects_path(cfg, src.env);
            if (projects_path === null) {
                return { ...EMPTY_READ, status: "unavailable", lastError: "path unavailable" };
            }
            const state = commandcode_states.get(src.key) ?? create_commandcode_scan_state();
            const result = scan_commandcode_jsonls(projects_path, src.env, state);
            commandcode_states.set(src.key, result.new_state);
            if (result.missing) {
                const lastError = `projects dir missing: ${projects_path}`;
                return {
                    ...EMPTY_READ,
                    status: "unavailable",
                    lastError,
                    logMessage: `${src.key} ${lastError}`,
                };
            }
            if (result.file_unreadable) {
                return {
                    sessions: result.sessions,
                    daily: result.daily,
                    records: result.records,
                    status: "failed",
                    lastError: "some commandcode project files unreadable",
                    logMessage: `${src.key} partially unreadable: some project files unreadable`,
                };
            }
            return {
                sessions: result.sessions,
                daily: result.daily,
                records: result.records,
                status: "ok",
            };
        }
        if (src.kind === "antigravity_index") {
            // t470: 会话发现索引（无用量 records）。summaries 缺失仍可回退扫
            // 目录；会话根目录缺失才报 missing。
            const conversations_path = antigravity_conversations_path(cfg, src.env);
            const summaries_path = antigravity_summaries_path(cfg, src.env);
            if (conversations_path === null || summaries_path === null) {
                return { ...EMPTY_READ, status: "unavailable", lastError: "path unavailable" };
            }
            const state = antigravity_states.get(src.key) ?? create_antigravity_scan_state();
            const result = scan_antigravity_sessions(
                conversations_path,
                summaries_path,
                src.env,
                state,
            );
            antigravity_states.set(src.key, result.new_state);
            if (result.missing) {
                const lastError = `sessions dir missing: ${conversations_path}`;
                return {
                    ...EMPTY_READ,
                    status: "unavailable",
                    lastError,
                    logMessage: `${src.key} ${lastError}`,
                };
            }
            if (result.file_unreadable) {
                return {
                    sessions: result.sessions,
                    daily: result.daily,
                    records: result.records,
                    status: "failed",
                    lastError: "some antigravity index files unreadable",
                    logMessage: `${src.key} partially unreadable: some index files unreadable`,
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

    // t438 review test_f001：上轮发现失败（null）本轮重探自愈；已发现结果
    // 进程内继续缓存（probe 替换 / reset_config 才清）。
    if (win_home_wsl_cache === null) {
        win_home_wsl_probed_this_round = false;
    }

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
    // t385 AC-003: 快照 read_source 前各 map 条目与游标前值——失败按快照恢复
    // （而非删除），保证「失败轮无副作用 + 截断进度不错误回滚」。
    const participated: {
        src: SourceDef;
        costs: CostsState | undefined;
        opencode: number | undefined;
        jsonl: SessionScanState | undefined;
        kimi: KimiScanState | undefined;
        grok: GrokScanState | undefined;
        codex: CodexScanState | undefined;
        commandcode: CommandCodeScanState | undefined;
        antigravity: AntigravityScanState | undefined;
        cursor: { sessions: Set<string>; daily: Set<string> } | undefined;
    }[] = [];
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
        // t385 AC-003: read_source 前快照各 map 该源条目与游标前值，失败时恢复。
        // cursor 的 Set 需深拷贝——截断分支原地 add 会改同一引用，快照须独立。
        const cursor_snap = source_cursors.get(src.key);
        participated.push({
            src,
            costs: costs_state.get(src.key),
            opencode: opencode_max_updated.get(src.key),
            jsonl: jsonl_states.get(src.key),
            kimi: kimi_states.get(src.key),
            grok: grok_states.get(src.key),
            codex: codex_states.get(src.key),
            commandcode: commandcode_states.get(src.key),
            antigravity: antigravity_states.get(src.key),
            cursor: cursor_snap
                ? { sessions: new Set(cursor_snap.sessions), daily: new Set(cursor_snap.daily) }
                : undefined,
        });
        const result = read_source(src, config);
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
        // t345 AC-003 + t385 AC-002: 截断游标——按已入列身份键跳过（非排序位置
        // 计数，新会话排序在游标前不漏发）。reader 按 session_id 排序产出，
        // 身份集合推进保证跨轮不重发也不丢失。
        const cursor = source_cursors.get(src.key);
        const pushed_sids: string[] = [];
        const pushed_dkeys: string[] = [];
        // t386 AC-001: 本轮扫描到的会话视为活跃触碰，刷新其 touch 时间——
        // prune_emitted 据此保留活跃长会话的 key。touch 键含 source|env 前缀，
        // 防跨源会话 id 碰撞（一源活跃误保另一源 key）。
        for (const s of result.sessions) {
            session_touch_ts.set(`${src.source}|${src.env}|${s.id}`, Date.now());
        }
        for (const s of result.sessions) {
            if (cursor?.sessions.has(s.id)) continue;
            if (all_sessions.length >= MAX_RECORDS) break;
            all_sessions.push(s);
            pushed_sids.push(s.id);
        }
        for (const d of result.daily) {
            // daily.id === session_id（各 reader 已核实），date+model 区分同会话多日。
            const dkey = `${d.id}|${d.date}|${d.model}`;
            if (cursor?.daily.has(dkey)) continue;
            if (all_daily.length >= MAX_RECORDS * 5) break;
            all_daily.push(d);
            pushed_dkeys.push(dkey);
        }
        for (const r of result.records) {
            const key = record_key(r);
            // t393 AC-003: 过窗且会话不活跃的 key 视为未 emit 本轮重发（不再延迟
            // 一轮）；活跃/窗口内 key 跳过。
            if (!should_emit_record(key)) continue;
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
            // t345 AC-003 + t385 AC-001: 超上限截断——把本轮新入列身份键并入游标，
            // 回滚该 source 的扫描状态使下轮全量重扫，按身份集合推进跨轮发完。
            const set = source_cursors.get(src.key) ?? {
                sessions: new Set<string>(),
                daily: new Set<string>(),
            };
            for (const id of pushed_sids) set.sessions.add(id);
            for (const key of pushed_dkeys) set.daily.add(key);
            source_cursors.set(src.key, set);
            for (const map of [
                costs_state,
                opencode_max_updated,
                jsonl_states,
                kimi_states,
                grok_states,
                codex_states,
                commandcode_states,
                antigravity_states,
            ] as const) {
                map.delete(src.key);
            }
            truncated_sources.push(src);
        } else if (cursor) {
            // 未截断：游标已消费完，清除。
            source_cursors.delete(src.key);
        }
    }

    // t393 AC-003: 内存裁剪放源循环后——所有 source 的会话 touch 已刷新，
    // prune 能正确保留活跃长会话的 key（t386 AC-001）；边界到期且会话不活跃的
    // key 已在去重循环被放行重发（should_emit_record），此处删除防 Map 膨胀。
    prune_emitted();

    const update: TokenStatsUpdate = {
        type: "token_stats_update",
        sessions: all_sessions,
        daily: all_daily,
        records: all_records,
        sources_status: all_sources_status,
    };

    try {
        get_parent_port()?.postMessage(update);
        const now = Date.now();
        for (const key of newly_emitted) {
            emitted_record_keys.set(key, now);
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        forward_log("error", "collector", `postMessage failed: ${msg}`);
        // t345 AC-004 + t385 AC-003: postMessage 失败——按轮前快照恢复各参与 source
        // 的扫描状态与截断游标（而非删除），下一轮全量重扫并重发（否则增量 reader
        // 不重产出失败轮 records，数据静默丢失）。快照恢复使失败轮在持久态上无副作用，
        // 截断进度回到轮前值（已发前缀仍跳过），不误删导致永久停滞或错误推进导致漏发。
        for (const snap of participated) {
            const k = snap.src.key;
            const set_or_delete = <T>(map: Map<string, T>, value: T | undefined): void => {
                if (value !== undefined) map.set(k, value);
                else map.delete(k);
            };
            set_or_delete(costs_state, snap.costs);
            set_or_delete(opencode_max_updated, snap.opencode);
            set_or_delete(jsonl_states, snap.jsonl);
            set_or_delete(kimi_states, snap.kimi);
            set_or_delete(grok_states, snap.grok);
            set_or_delete(codex_states, snap.codex);
            set_or_delete(commandcode_states, snap.commandcode);
            set_or_delete(antigravity_states, snap.antigravity);
            set_or_delete(source_cursors, snap.cursor);
        }
    }

    if (truncated_sources.length > 0) {
        forward_log("warn", "collector", "sessions exceed limit, stopping source collection");
    }

    // Persist scan state for incremental resume after restart (t114).
    // t346 AC-002: 本轮无新数据时跳过保存，避免每轮无条件全量序列化 + fsync。
    // 失败/不可用 source 不改写 state map（reader 失败不碰 map），postMessage
    // 失败的回滚仅发生在有数据被收集时（此时 all_* 非空已触发保存），故
    // has_changes 只需看数据与截断——永久不可用 source（如 Windows 无 Grok 的
    // grok_wsl）不再每轮触发保存。
    // Fire-and-forget: don't block the next scan on disk IO.
    const state_path = config.state_path;
    const has_changes =
        all_sessions.length > 0 ||
        all_daily.length > 0 ||
        all_records.length > 0 ||
        truncated_sources.length > 0 ||
        // t385 AC-001: 截断源游标入 scan-state，跨重启保留推进进度。
        source_cursors.size > 0;
    if (state_path && has_changes) void save_state(state_path);
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
    codex_states.clear();
    commandcode_states.clear();
    antigravity_states.clear();
    source_warned.clear();
    emitted_record_keys.clear();
    source_cursors.clear();
    session_touch_ts.clear();
    wsl_user_cache = null;
    wsl_user_cache_distro = null;
    win_home_wsl_cache = null;
    win_home_wsl_probed_this_round = false;
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
    start_interval,
    costs_state,
    opencode_max_updated,
    jsonl_states,
    kimi_states,
    grok_states,
    commandcode_states,
    source_cursors,
    emitted_record_keys,
    session_touch_ts,
    EMITTED_WINDOW_MS,
    claude_costs_path,
    claude_projects_path,
    opencode_path,
    kimi_sessions_path,
    kimi_index_path,
    commandcode_projects_path,
    grok_sessions_path,
    effective_wsl_user,
    set_win_home_wsl_probe,
};
