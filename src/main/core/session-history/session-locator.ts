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
 * t254：解析结果持久化到 `<index_dir>/session-path-index.json`，跨重启命中免整目录
 * 递归扫描；索引失效（文件移动/删除/内容变化）时回退扫描并更新索引。
 */
import { closeSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createLogger } from "../../../shared/lib/logger";
import type { Env, ExtractorKind } from "./subscription-service";
import { getDataRoot } from "../paths";
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

/** 进程内加速缓存（含 paths_key）；跨重启由持久索引恢复（按 index_dir 隔离）。 */
const resolution_cache = new Map<string, ResolutionCacheEntry>();
/** 磁盘持久索引（当前 index_dir 的内存态）。 */
let session_index: Map<string, SessionIndexEntry> | null = null;
let session_index_loaded_dir: string | null = null;
/** wsl 用户名探测缓存（distro → user），跨重启由持久索引恢复。 */
let wsl_user_cache: Record<string, string> | null = null;

function locator_paths_key(paths: LocatorPaths): string {
    return `${paths.win_home}|${paths.wsl_distro}|${paths.wsl_user}`;
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
}

/** locator 支持的 source 集合（与 token-stats 四端对齐，kimi 带下划线）。 */
export type HistorySource = "claude_code" | "opencode" | "kimi_code" | "grok";

export interface ResolvedSession {
    /** 提取器要读的源文件 / db 完整路径。 */
    readonly file_path: string;
    readonly extractor_kind: ExtractorKind;
}

export interface LocatorPaths {
    /** win 环境下用户家目录（collector 用 win_home）。 */
    readonly win_home: string;
    /** wsl distro 名（如 "Ubuntu-22.04"）。 */
    readonly wsl_distro: string;
    /** wsl 用户名（空串=未配置，由调用方自行决定探测策略）。 */
    readonly wsl_user: string;
    /** 持久索引目录；缺省用 data root。 */
    readonly index_dir?: string;
}

export const DEFAULT_LOCATOR_PATHS: Readonly<LocatorPaths> = Object.freeze({
    win_home: homedir(),
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

function claude_projects_dir(paths: LocatorPaths, env: Env): string | null {
    if (env === "win") return join(paths.win_home, ".claude", "projects");
    return wsl_home(paths, ".claude", "projects");
}

function opencode_db_path(paths: LocatorPaths, env: Env): string | null {
    if (env === "win") {
        return join(paths.win_home, ".local", "share", "opencode", "opencode.db");
    }
    return wsl_home(paths, ".local", "share", "opencode", "opencode.db");
}

function kimi_sessions_dir(paths: LocatorPaths, env: Env): string | null {
    if (env === "win") return join(paths.win_home, ".kimi-code", "sessions");
    return wsl_home(paths, ".kimi-code", "sessions");
}

function grok_sessions_dir(paths: LocatorPaths): string | null {
    // grok 在 d017 仅 WSL 有数据；与 collector grok_sessions_path 一致。
    return wsl_home(paths, ".grok", "sessions");
}

function wsl_home(paths: LocatorPaths, ...segments: string[]): string | null {
    const user = effective_wsl_user(paths);
    if (!user) {
        return null;
    }
    return join(`\\\\wsl.localhost\\${paths.wsl_distro}\\home\\${user}`, ...segments);
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
    const root = claude_projects_dir(paths, env);
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
    const db = opencode_db_path(paths, env);
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
    const root = kimi_sessions_dir(paths, env);
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

function resolve_grok(paths: LocatorPaths, session_id: string): ResolvedSession | null {
    const root = grok_sessions_dir(paths);
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

/** 写入当前条目到磁盘索引并落盘；写失败仅记日志跳过，回退为扫描定位（t254 f005）。 */
function persist_index_entry(
    index_dir: string | undefined,
    key: string,
    entry: SessionIndexEntry | null,
): void {
    if (!index_dir) return;
    try {
        const index = ensure_session_index(index_dir);
        if (!index) return;
        if (entry) {
            index.set(key, entry);
        } else {
            index.delete(key);
        }
        save_session_index(index_dir, index, wsl_user_cache ?? load_wsl_user_cache(index_dir));
    } catch (err) {
        log.warn(`session index persist failed (${key}): ${String(err)}`);
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
                // grok 仅 WSL（d017）；env 仍接收以便未来扩展，但路径解析固定走 WSL。
                void env;
                return resolve_grok(paths, session_id);
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
