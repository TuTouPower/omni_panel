/**
 * 会话文件路径持久索引（t254）。
 *
 * 把 (source, env, session_id) → 会话文件路径 的解析结果持久化，跨重启命中，
 * 避免冷启动后首次打开会话面板时逐会话整目录递归扫描。
 *
 * 同步读写（resolve_session_file 是同步接口）；损坏或版本不符时整体丢弃重建，
 * 等价退回扫描定位。文件放 `<dataRoot>/session-path-index.json`。
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Env, ExtractorKind } from "./subscription-service";

export const SESSION_INDEX_FILE = "session-path-index.json";
export const SESSION_INDEX_VERSION = 1;

export interface SessionIndexEntry {
    /** paths 签名（win_home|wsl_distro|wsl_user），命中时校验防跨配置命中旧路径。 */
    readonly paths_key: string;
    readonly file_path: string;
    readonly extractor_kind: ExtractorKind;
    readonly mtime_ms: number;
    readonly size: number;
}

export interface SessionIndexFile {
    readonly version: number;
    /** distro → 探测到的 wsl 用户名，跨重启缓存避免每次 resolve 重探测。 */
    wsl_user_cache?: Record<string, string>;
    entries?: Record<string, SessionIndexEntry>;
}

export function session_index_key(source: string, env: Env, session_id: string): string {
    return `${source}|${env}|${session_id}`;
}

/** 载入持久索引；文件缺失 / 损坏 / 版本不符返回空 Map（丢弃重建）。 */
export function load_session_index(index_dir: string): Map<string, SessionIndexEntry> {
    try {
        const raw = readFileSync(join(index_dir, SESSION_INDEX_FILE), "utf8");
        const parsed = JSON.parse(raw) as SessionIndexFile;
        if (parsed.version !== SESSION_INDEX_VERSION) return new Map();
        return new Map(Object.entries(parsed.entries ?? {}));
    } catch {
        return new Map();
    }
}

/** 载入 wsl 用户名缓存（distro → user）。 */
export function load_wsl_user_cache(index_dir: string): Record<string, string> {
    try {
        const raw = readFileSync(join(index_dir, SESSION_INDEX_FILE), "utf8");
        const parsed = JSON.parse(raw) as SessionIndexFile;
        if (parsed.version !== SESSION_INDEX_VERSION) return {};
        return parsed.wsl_user_cache ?? {};
    } catch {
        return {};
    }
}

/** 同步原子写持久索引（tmp + rename）。 */
export function save_session_index(
    index_dir: string,
    map: Map<string, SessionIndexEntry>,
    wsl_user_cache?: Record<string, string>,
): void {
    const file = join(index_dir, SESSION_INDEX_FILE);
    mkdirSync(index_dir, { recursive: true });
    const tmp = `${file}.tmp`;
    const data: SessionIndexFile = {
        version: SESSION_INDEX_VERSION,
        ...(wsl_user_cache ? { wsl_user_cache } : {}),
        entries: Object.fromEntries(map),
    };
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    renameSync(tmp, file);
}
