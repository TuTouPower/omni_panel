/**
 * 会话历史定位器（t210 对接层，t254 加持久索引）。
 *
 * 把 (source, env, session_id) 解析到提取器需要的源文件路径 + extractor_kind。
 * 仅读：扫描目录、读 JSONL 首行/匹配字段，不写业务文件。
 *
 * 路径模型对齐 token-stats collector（src/main/core/token-stats/collector.ts）与
 * 各 reader（claude/grok/kimi/opencode-reader.ts）；scan_jsonl 系列函数在 collector
 * utility 进程里运行，主进程无法直接复用，故在此独立实现最小的 session_id 匹配扫描。
 *
 * t310：路径构建改走 t308 平台感知路径层（src/main/core/token-stats/paths.ts）——
 * (host, homedir, win_home, win_home_wsl, wsl_distro, wsl_user) → path|null 纯函数，
 * 消除 `win_home: homedir()` 在非 Windows 宿主拼 `\`/UNC 失效的同源 bug（p132/d035）。
 * env 语义与 t437 对齐：`win|wsl|linux|mac`（win→win_home、linux/mac→homedir、
 * wsl→UNC，替代 pre-t437 的 `local`）；host 由调用方注入
 * （index.ts 从 process.platform 推导），测试注入任意宿主。
 * t438：linux 宿主上 win 源经 win_home_wsl（/mnt/c/Users 自动发现）解析。
 *
 * t254：解析结果持久化到 `<index_dir>/session-path-index.json`，跨重启命中免整目录
 * 递归扫描；索引失效（文件移动/删除/内容变化）时回退扫描并更新索引。
 */
import { closeSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createLogger } from "../../../shared/lib/logger";
import type { Env, ExtractorKind } from "./subscription-service";
import { antigravity_index_has_session } from "./antigravity-extractor";
import { getDataRoot } from "../paths";
import * as path_layer from "../token-stats/paths";
import {
    discover_win_home,
    default_win_home_deps,
    type WinHomeDiscoveryDeps,
} from "../token-stats/win-home-discovery";
import {
    load_session_index,
    load_wsl_user_cache,
    save_session_index,
    session_index_key,
    type SessionIndexEntry,
} from "./session-path-index";

const log = createLogger("session-locator");

/** 进程内缓存条目 = 磁盘索引条目（含 paths_key 签名）。 */
type ResolutionCacheEntry = SessionIndexEntry;

// t367: 本模块为进程级单例（模块级可变状态 + 函数导出），非实例化工厂。
// 单例约束：应用生命周期内只有一个 session-locator；index_dir 切换由
// ensure_session_index 按 loaded_dir 重新加载。多实例化需重构为工厂（当前无需求）。
/** 进程内加速缓存（含 paths_key）；跨重启由持久索引恢复（按 index_dir 隔离）。 */
const resolution_cache = new Map<string, ResolutionCacheEntry>();
/** 磁盘持久索引（当前 index_dir 的内存态）。 */
let session_index: Map<string, SessionIndexEntry> | null = null;
let session_index_loaded_dir: string | null = null;
/** wsl 用户名探测缓存（distro → user），跨重启由持久索引恢复。 */
let wsl_user_cache: Record<string, string> | null = null;
/** t438: Windows home 惰性发现进程内缓存；null = 未缓存（发现失败走负缓存节流）。 */
let win_home_wsl_cache: string | null = null;
/** t438 review f005：发现失败（null）的负缓存截止时间戳（ms）。窗内重探直接
 *  返回 null——否则 AC-005 画像（零候选 → 回退 powershell.exe）下每次 resolve
 *  都同步 spawn 0.5-5s，内容搜索批量 resolve 会分钟级卡顿；窗后重探自愈。 */
let win_home_wsl_null_until = 0;
const WIN_HOME_REPROBE_INTERVAL_MS = 60_000;
/** Test-only probe override: replaces discover_win_home(default deps). */
let win_home_wsl_probe: ((deps: WinHomeDiscoveryDeps) => string | null) | null = null;

// t264: 落盘批间合并——dirty 标记 + debounce flush。仅索引内容实际变化时置 dirty
// 并 schedule 一次 flush；delete 不存在的 key（内容未变）不置 dirty，零写盘。
// 批量冷会话解析窗口内多次 persist 合并为一次落盘。s024 spike 验证机制。
const INDEX_FLUSH_DEBOUNCE_MS = 50;
let index_dirty_dir: string | null = null;
/** dirty 时对应 index_dir 的内存 map 引用；切 dir 后旧 map 仍可经此落盘。 */
let index_dirty_map: Map<string, SessionIndexEntry> | null = null;
let index_flush_timer: ReturnType<typeof setTimeout> | null = null;

function locator_paths_key(paths: LocatorPaths): string {
    // 签名覆盖路径层全部输入：host/homedir/win_home/win_home_wsl/wsl_distro/wsl_user。
    // 任一变化（含 host 切换、Windows home 发现结果变化）→ 旧签名不命中 →
    // 索引条目失效重建（AC-004）。win_home_wsl 取 effective 值（t438 review f001：
    // 惰性发现结果变化也须失效旧条目，不能只看调用方传入的原始字段）。
    return `${paths.host}|${paths.homedir}|${paths.win_home}|${effective_win_home_wsl(paths) ?? ""}|${paths.wsl_distro}|${paths.wsl_user}`;
}

function safe_file_stat(file_path: string): { mtime_ms: number; size: number } | null {
    try {
        const st = statSync(file_path);
        return { mtime_ms: st.mtimeMs, size: st.size };
    } catch {
        return null;
    }
}

/** 清空定位缓存（测试用）。 */
export function clear_resolution_cache(): void {
    resolution_cache.clear();
    session_index = null;
    session_index_loaded_dir = null;
    wsl_user_cache = null;
    win_home_wsl_cache = null;
    win_home_wsl_null_until = 0;
    index_dirty_dir = null;
    index_dirty_map = null;
    if (index_flush_timer !== null) {
        clearTimeout(index_flush_timer);
        index_flush_timer = null;
    }
}

/** locator 支持的 source 集合（t446 +codex；t455 +antigravity）。 */
export type HistorySource =
    | "claude_code"
    | "opencode"
    | "kimi_code"
    | "grok"
    | "codex"
    | "antigravity";

export interface ResolvedSession {
    /** 提取器要读的源文件 / db 完整路径。 */
    readonly file_path: string;
    readonly extractor_kind: ExtractorKind;
}

export interface LocatorPaths {
    /** 运行宿主（t308 路径层 host；index.ts 从 process.platform 推导，测试注入任意值）。 */
    readonly host: path_layer.Host;
    /** os.homedir()；linux/mac 源基路径。 */
    readonly homedir: string;
    /** Windows 宿主 user home（win_home；仅 win 源使用）。 */
    readonly win_home: string;
    /**
     * t438: WSL/Linux 宿主自动发现的 Windows user home（/mnt/c/Users/<u>，
     * POSIX）——linux 宿主上 win 源经它解析（与 collector 同源发现）。
     * 显式字符串 = 直接使用；"" = 禁用哨兵（win 源不可达，对齐 wsl_user 空串
     * 语义）；null/undefined = linux 宿主 resolve 时惰性自动发现（f001）。
     */
    readonly win_home_wsl?: string | null;
    /** wsl distro 名（如 "Ubuntu-22.04"）。 */
    readonly wsl_distro: string;
    /** wsl 用户名（空串=未配置，由调用方自行决定探测策略）。 */
    readonly wsl_user: string;
    /** 持久索引目录；缺省用 data root。 */
    readonly index_dir?: string;
}

export const DEFAULT_LOCATOR_PATHS: Readonly<LocatorPaths> = Object.freeze({
    host: path_layer.host_from_platform(process.platform),
    homedir: homedir(),
    win_home: homedir(),
    win_home_wsl: null,
    wsl_distro: "Ubuntu-22.04",
    wsl_user: "",
});

const MAX_DEPTH = 4;

interface DirentLike {
    readonly name: string;
    readonly isDirectory: () => boolean;
    readonly isFile: () => boolean;
}

function safe_readdir(dir: string): DirentLike[] {
    try {
        return readdirSync(dir, { withFileTypes: true });
    } catch {
        return [];
    }
}

/** 递归收集目录下匹配 fileName 的所有文件路径（只读、深度受限）。 */
function collect_files_named(dir: string, file_name: string, depth: number, out: string[]): void {
    if (depth > MAX_DEPTH) return;
    for (const entry of safe_readdir(dir)) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            collect_files_named(full, file_name, depth + 1, out);
        } else if (entry.isFile() && entry.name === file_name) {
            out.push(full);
        }
    }
}

/** 递归收集所有 *.jsonl 文件。 */
function collect_jsonls(dir: string, depth: number, out: string[]): void {
    if (depth > MAX_DEPTH) return;
    for (const entry of safe_readdir(dir)) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            collect_jsonls(full, depth + 1, out);
        } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
            out.push(full);
        }
    }
}

/** 读 jsonl 第一条非空行的 sessionId 字段（claude_code transcript）。 */
function session_id_of_claude_file(file_path: string): string | null {
    let content: string;
    try {
        // 只读前 8KB 足够命中首行 sessionId；避免大文件全读。
        const stat = statSync(file_path);
        const head_size = Math.min(stat.size, 8192);
        if (head_size === 0) return null;
        const buf = Buffer.alloc(head_size);
        const fd = openSync(file_path, "r");
        try {
            readSync(fd, buf, 0, head_size, 0);
        } finally {
            closeSync(fd);
        }
        content = buf.toString("utf-8");
    } catch {
        return null;
    }
    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            const rec = JSON.parse(trimmed) as { sessionId?: unknown };
            if (typeof rec.sessionId === "string" && rec.sessionId !== "") {
                return rec.sessionId;
            }
        } catch {
            // 继续下一行
        }
    }
    return null;
}

/**
 * Test-only injection（对齐 collector set_win_home_wsl_probe）：probe 覆盖发现逻辑，
 * 避免测试在 WSL 开发机上真实探测 /mnt/c 与 powershell.exe。Production never calls it。
 * 替换 probe 时同时清缓存。
 */
export function set_win_home_wsl_probe(
    probe: ((deps: WinHomeDiscoveryDeps) => string | null) | null,
): void {
    win_home_wsl_probe = probe;
    win_home_wsl_cache = null;
    win_home_wsl_null_until = 0;
}

/**
 * t438 review f001：resolve 时惰性发现 Windows home（替代 index.ts 一次性注入——
 * 直接调 resolve_session_file 的路径绕不开启动注入）。
 * 显式字符串优先（"" = 禁用哨兵，对齐 wsl_user 空串语义，测试用它保 hermetic）；
 * null/undefined 且 linux 宿主才惰性发现。成功结果进程内缓存；失败（null）负缓存
 * 一个时间窗（f005 节流，对齐 collector 轮级节流语义），窗后重探自愈。
 */
function effective_win_home_wsl(paths: LocatorPaths): string | null {
    if (typeof paths.win_home_wsl === "string") {
        const trimmed = paths.win_home_wsl.trim();
        return trimmed === "" ? null : trimmed;
    }
    if (paths.host !== "linux") {
        return null;
    }
    if (win_home_wsl_cache !== null) {
        return win_home_wsl_cache;
    }
    if (Date.now() < win_home_wsl_null_until) {
        return null;
    }
    const detected = (win_home_wsl_probe ?? discover_win_home)({
        ...default_win_home_deps,
        on_decision: (message) => {
            log.warn(message);
        },
    });
    if (detected !== null) {
        win_home_wsl_cache = detected;
    } else {
        win_home_wsl_null_until = Date.now() + WIN_HOME_REPROBE_INTERVAL_MS;
    }
    return win_home_wsl_cache;
}

/**
 * 路径层输入（t310/t438）：host/homedir/win_home/win_home_wsl/wsl_* 透传；
 * wsl 源才解析有效用户名。
 */
function locator_path_input(paths: LocatorPaths, env: Env): path_layer.TokenStatsPathInput {
    return {
        host: paths.host,
        homedir: paths.homedir,
        win_home: paths.win_home,
        // win 源取 effective 值（显式配置优先，缺省惰性发现）；其余 env 透传显式配置。
        win_home_wsl: env === "win" ? effective_win_home_wsl(paths) : (paths.win_home_wsl ?? null),
        wsl_distro: paths.wsl_distro,
        // wsl 源才需要有效用户名：探测只在 wsl resolve 时触发，win/linux/mac 源不探测
        // （避免无 WSL 宿主上平台源解析引入不必要的 UNC 探测）。
        wsl_user: env === "wsl" ? effective_wsl_user(paths) : paths.wsl_user,
    };
}

/**
 * source → 源文件/db 路径（t310：复用 t308 路径层，纯函数不碰 fs）。
 * 返回 null = 该 (source, env) 在当前宿主不可达（非 Windows 宿主 wsl 源 /
 * wsl_user 探测失败，AC-001/003）。
 */
export function locator_source_path(
    source: HistorySource,
    env: Env,
    paths: LocatorPaths,
): string | null {
    const input = locator_path_input(paths, env);
    switch (source) {
        case "claude_code":
            return path_layer.claude_projects_path(input, env);
        case "opencode":
            return path_layer.opencode_path(input, env);
        case "kimi_code":
            return path_layer.kimi_sessions_path(input, env);
        case "grok":
            return path_layer.grok_sessions_path(input, env);
        case "codex":
            return path_layer.codex_sessions_path(input, env);
        case "antigravity":
            return path_layer.antigravity_conversations_path(input, env);
    }
}

/**
 * WSL 用户名：显式配置优先；空串时自动探测（对齐 collector effective_wsl_user）：
 * 列 \\wsl.localhost\<distro>\home 取第一个目录。探测失败（无 WSL / 无用户）返回 ""。
 *
 * t254：结果在进程内缓存（同 distro 只探测一次），并随持久索引跨重启缓存。
 */
function effective_wsl_user(paths: LocatorPaths): string {
    if (paths.wsl_user !== "") {
        return paths.wsl_user;
    }
    if (wsl_user_cache === null) {
        const index_dir = resolve_index_dir(paths);
        wsl_user_cache = index_dir ? load_wsl_user_cache(index_dir) : {};
    }
    const cached = wsl_user_cache[paths.wsl_distro];
    if (cached !== undefined) {
        return cached;
    }
    const home = `\\\\wsl.localhost\\${paths.wsl_distro}\\home`;
    const entry = safe_readdir(home).find((e) => e.isDirectory());
    const user = entry?.name ?? "";
    // 只缓存非空探测结果：WSL 未挂载时探测返回空，负缓存会让整进程 WSL 会话
    // 不再自愈（t254 f001）；空串不写缓存，下次 resolve 重探测。
    if (user !== "") {
        wsl_user_cache[paths.wsl_distro] = user;
        const index_dir = resolve_index_dir(paths);
        if (index_dir) {
            try {
                const index =
                    ensure_session_index(index_dir) ?? new Map<string, SessionIndexEntry>();
                save_session_index(index_dir, index, wsl_user_cache);
            } catch (err) {
                log.warn(`session index persist failed (wsl_user): ${String(err)}`);
            }
        }
    }
    return user;
}

function resolve_claude_code(
    paths: LocatorPaths,
    env: Env,
    session_id: string,
): ResolvedSession | null {
    const root = locator_source_path("claude_code", env, paths);
    if (root === null) return null;
    const files: string[] = [];
    collect_jsonls(root, 0, files);
    for (const file of files) {
        // 快速路径：文件名 === session_id.jsonl（主 transcript）
        const base = file.slice(-session_id.length - 6, -6); // 去掉 .jsonl
        if (base === session_id) {
            return { file_path: file, extractor_kind: "claude_code" };
        }
    }
    // 慢路径：解析每个文件首行 sessionId 字段匹配
    for (const file of files) {
        const sid = session_id_of_claude_file(file);
        if (sid === session_id) {
            return { file_path: file, extractor_kind: "claude_code" };
        }
    }
    return null;
}

function resolve_opencode(paths: LocatorPaths, env: Env): ResolvedSession | null {
    const db = locator_source_path("opencode", env, paths);
    if (db === null) return null;
    try {
        statSync(db);
    } catch {
        return null;
    }
    // opencode session_id 是 db 内的主键，不靠路径区分；返回 db 路径，由提取器/订阅服务用 session_id 查表。
    return { file_path: db, extractor_kind: "opencode" };
}

function resolve_kimi_code(
    paths: LocatorPaths,
    env: Env,
    session_id: string,
): ResolvedSession | null {
    const root = locator_source_path("kimi_code", env, paths);
    if (root === null) return null;
    const files: string[] = [];
    collect_files_named(root, "wire.jsonl", 0, files);
    // 目录名含 session_id：.../session_<uuid>/agents/main/wire.jsonl，目录名 === session_id
    for (const file of files) {
        const parts = file.split(/[\\/]/);
        const agents_idx = parts.lastIndexOf("agents");
        if (agents_idx > 0 && parts[agents_idx - 1] === session_id) {
            return { file_path: file, extractor_kind: "kimi" };
        }
    }
    return null;
}

function resolve_grok(paths: LocatorPaths, env: Env, session_id: string): ResolvedSession | null {
    // grok 数据侧仅 WSL（d017），但路径解析跟随 env（t310 对齐路径层：非 Windows
    // 宿主 linux/mac env 亦可解析到 ~/.grok/sessions，AC-001）。
    const root = locator_source_path("grok", env, paths);
    if (root === null) return null;
    const files: string[] = [];
    // grok 提取器读 chat_history.jsonl（见 grok-extractor.ts），与 token-stats 的
    // updates.jsonl 是同目录不同文件；这里扫 chat_history.jsonl。
    collect_files_named(root, "chat_history.jsonl", 0, files);
    for (const file of files) {
        // 目录结构 .../sessions/<enc_cwd>/<session_id>/chat_history.jsonl，session_id 是父目录名
        const parts = file.split(/[\\/]/);
        const file_idx = parts.lastIndexOf("chat_history.jsonl");
        if (file_idx > 0 && parts[file_idx - 1] === session_id) {
            return { file_path: file, extractor_kind: "grok" };
        }
    }
    return null;
}

function resolve_codex(paths: LocatorPaths, env: Env, session_id: string): ResolvedSession | null {
    // codex 数据仅本机 ~/.codex（t445：无 wsl 对侧）；dated 目录 YYYY/MM/DD 下
    // 文件名 rollout-*-<session_id>.jsonl 尾部 UUID 即 session_id（d051）。
    const root = locator_source_path("codex", env, paths);
    if (root === null) return null;
    const files: string[] = [];
    collect_jsonls(root, 0, files);
    const suffix = `-${session_id}.jsonl`;
    for (const file of files) {
        const base = file.split(/[\\/]/).pop() ?? "";
        if (base.startsWith("rollout-") && base.endsWith(suffix)) {
            return { file_path: file, extractor_kind: "codex" };
        }
    }
    return null;
}

function resolve_antigravity(
    paths: LocatorPaths,
    env: Env,
    session_id: string,
): ResolvedSession | null {
    // antigravity 每会话一库：conversations/<session_id>.db（d054）。
    // 索引优先：conversation_summaries.db 命中则直接拼文件（仍校验存在）；
    // 索引缺行（实测 7/38）回退扫目录文件名。
    const root = locator_source_path("antigravity", env, paths);
    if (root === null) return null;
    const direct = join(root, `${session_id}.db`);
    const input = locator_path_input(paths, env);
    const summaries = path_layer.antigravity_summaries_path(input, env);
    if (summaries !== null && antigravity_index_has_session(summaries, session_id)) {
        try {
            const st = statSync(direct);
            if (st.isFile()) {
                return { file_path: direct, extractor_kind: "antigravity" };
            }
        } catch {
            // 索引命中但文件缺失：继续回退扫目录。
        }
    }
    const files = safe_readdir(root);
    for (const entry of files) {
        if (entry.isFile() && entry.name === `${session_id}.db`) {
            return { file_path: join(root, entry.name), extractor_kind: "antigravity" };
        }
    }
    return null;
}

function resolve_index_dir(paths: LocatorPaths): string | undefined {
    if (paths.index_dir) return paths.index_dir;
    try {
        return getDataRoot();
    } catch {
        // 测试 / 无 electron 环境：禁用持久索引（退化为纯内存缓存）。
        return undefined;
    }
}

/** 按 index_dir 惰性载入磁盘索引；缺省 index_dir 返回 null（禁用持久索引）。
 * 载入时顺带同步 wsl_user_cache（与磁盘态合并），避免 win-only resolve 写盘
 * 抹掉已持久化的 WSL 探测缓存（t254 f004）。 */
function ensure_session_index(
    index_dir: string | undefined,
): Map<string, SessionIndexEntry> | null {
    if (!index_dir) return null;
    if (session_index === null || session_index_loaded_dir !== index_dir) {
        session_index = load_session_index(index_dir);
        session_index_loaded_dir = index_dir;
        wsl_user_cache ??= load_wsl_user_cache(index_dir);
    }
    return session_index;
}

/** 标记索引脏并调度 debounce flush；仅索引内容实际变化时置 dirty（t264）。
 * 同时保存 map 引用，切 index_dir 后旧 map 仍可经 flush_session_index 落盘。 */
function schedule_index_flush(index_dir: string): void {
    index_dirty_dir = index_dir;
    index_dirty_map = session_index;
    if (index_flush_timer !== null) return;
    index_flush_timer = setTimeout(() => {
        index_flush_timer = null;
        try {
            flush_session_index();
        } catch (err) {
            log.warn(`session index debounce flush failed: ${String(err)}`);
        }
    }, INDEX_FLUSH_DEBOUNCE_MS);
}

/**
 * 同步落盘当前内存索引（若脏）。退出路径（before-quit）与测试在 resolve 后调用，
 * 保证已 resolve 条目全部落盘（t264）。无参：flush 当前 dirty 的 index_dir。
 * 用 schedule 时保存的 map 引用落盘（f002：命中早退路径切 dir 后 session_index
 * 已被换成新 dir map，ensure_session_index 取不到旧 dir 待落盘条目）。
 */
export function flush_session_index(): void {
    const index_dir = index_dirty_dir;
    if (!index_dir) return;
    if (index_flush_timer !== null) {
        clearTimeout(index_flush_timer);
        index_flush_timer = null;
    }
    const map = index_dirty_map;
    index_dirty_dir = null;
    index_dirty_map = null;
    try {
        if (!map) return;
        save_session_index(index_dir, map, wsl_user_cache ?? load_wsl_user_cache(index_dir));
    } catch (err) {
        log.warn(`session index persist failed: ${String(err)}`);
    }
}

/** 写入/删除当前条目到内存索引；置 dirty 后 debounce 落盘（t264 合并批间写）。 */
function persist_index_entry(
    index_dir: string | undefined,
    key: string,
    entry: SessionIndexEntry | null,
): void {
    if (!index_dir) return;
    try {
        // 切换 index_dir 前先落盘旧 dir 待落盘条目（其内存 map 仍是当前 session_index）。
        if (index_dirty_dir !== null && index_dirty_dir !== index_dir) {
            flush_session_index();
        }
        const index = ensure_session_index(index_dir);
        if (!index) return;
        if (entry) {
            index.set(key, entry);
        } else {
            if (!index.has(key)) return; // 未命中且内容不变：不置 dirty，零写盘。
            index.delete(key);
        }
        schedule_index_flush(index_dir);
    } catch (err) {
        log.warn(`session index persist failed: ${String(err)}`);
    }
}

/**
 * 解析 (source, env, session_id) → { file_path, extractor_kind }。
 * 找不到返回 null（IPC 层据此 fail）。
 *
 * 顺序：内存缓存 → 持久索引（跨重启）→ 扫描。命中后 stat 校验 mtime/size，
 * 文件移动/删除/内容变化则索引失效并回退扫描，回填后写盘。
 */
export function resolve_session_file(
    source: HistorySource,
    env: Env,
    session_id: string,
    paths: LocatorPaths = DEFAULT_LOCATOR_PATHS,
): ResolvedSession | null {
    const cache_key = session_index_key(source, env, session_id);
    const paths_key = locator_paths_key(paths);
    const index_dir = resolve_index_dir(paths);

    // 1. 进程内缓存（本次会话内重复定位零扫描）。
    const cached = resolution_cache.get(cache_key);
    if (cached?.paths_key === paths_key) {
        const st = safe_file_stat(cached.file_path);
        if (st?.mtime_ms === cached.mtime_ms && st.size === cached.size) {
            return { file_path: cached.file_path, extractor_kind: cached.extractor_kind };
        }
        resolution_cache.delete(cache_key);
    }

    // 2. 持久索引（跨重启命中，免整目录递归扫描）。
    const index = ensure_session_index(index_dir);
    if (index) {
        const indexed = index.get(cache_key);
        // 校验 paths_key：跨配置变更后不得命中旧 paths 的陈旧条目（t254 f003）。
        if (indexed?.paths_key === paths_key) {
            const st = safe_file_stat(indexed.file_path);
            if (st?.mtime_ms === indexed.mtime_ms && st.size === indexed.size) {
                resolution_cache.set(cache_key, indexed);
                return { file_path: indexed.file_path, extractor_kind: indexed.extractor_kind };
            }
            // 文件移动/删除/内容变化或 paths 不匹配：索引失效，回退扫描。
            persist_index_entry(index_dir, cache_key, null);
        }
    }

    // 3. 扫描定位。
    const resolved = ((): ResolvedSession | null => {
        switch (source) {
            case "claude_code":
                return resolve_claude_code(paths, env, session_id);
            case "opencode":
                return resolve_opencode(paths, env);
            case "kimi_code":
                return resolve_kimi_code(paths, env, session_id);
            case "grok":
                return resolve_grok(paths, env, session_id);
            case "codex":
                return resolve_codex(paths, env, session_id);
            case "antigravity":
                return resolve_antigravity(paths, env, session_id);
        }
    })();

    if (resolved) {
        const st = safe_file_stat(resolved.file_path);
        const entry: SessionIndexEntry = {
            paths_key,
            file_path: resolved.file_path,
            extractor_kind: resolved.extractor_kind,
            mtime_ms: st?.mtime_ms ?? 0,
            size: st?.size ?? 0,
        };
        resolution_cache.set(cache_key, entry);
        persist_index_entry(index_dir, cache_key, entry);
    } else {
        resolution_cache.delete(cache_key);
        persist_index_entry(index_dir, cache_key, null);
    }
    return resolved;
}
