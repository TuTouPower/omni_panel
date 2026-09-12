import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
    AgentSessionUsageRecord,
    TokenStatsDailyUpsert,
    TokenStatsEnv,
    TokenStatsSessionUpsert,
} from "../../../shared/types/token-stats";

// --- Antigravity conversation-summaries reader (t470) ---
//
// Antigravity CLI keeps a per-conversation sqlite db under
//   ~/.gemini/antigravity-cli/conversations/<uuid>.db  (d054: steps protobuf)
// plus one index db
//   ~/.gemini/antigravity-cli/conversation_summaries.db
//     table conversation_summaries(
//       conversation_id TEXT PRIMARY KEY, title TEXT, preview TEXT,
//       step_count INTEGER, last_modified_time TEXT(datetime, s035 实测
//       "2026-09-07 17:03:29.173191751+00:00" 形态，零值行 "0001-01-01 …"),
//       workspace_uris TEXT(JSON 数组，元素多为 file:// URI), …)
//
// s035 硬结论：明文层无任何 token 计数，本 reader 只做会话发现（对标
// t445 的 codex reader，但只产 sessions，不产 daily/records）。
// 用量面板配额与代理面板用量反推均不在本 task 范围。
//
// 增量：summaries.db mtime 变化才重读索引（失败也记 mtime，复写后 mtime
// 变化自愈）；回退库按文件 mtime 判定；facts 变化的会话才 emit。
// 缺目录 → missing（codex 同构）；索引缺行回退扫文件名 COUNT(*) steps。

const MAX_TITLE_LEN = 120;

/** better-sqlite3 原生 binding 路径，兼容打包与源码运行两种布局（opencode 同构）。 */
function native_binding_path(): string | undefined {
    const candidates = [
        path.resolve(
            __dirname,
            "..",
            "..",
            "node_modules",
            "better-sqlite3",
            "build",
            "Release",
            "better_sqlite3.node",
        ),
        path.resolve(
            process.cwd(),
            "node_modules",
            "better-sqlite3",
            "build",
            "Release",
            "better_sqlite3.node",
        ),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate));
}

const NATIVE_BINDING_PATH = native_binding_path();

export interface AntigravityFacts {
    title: string | null;
    directory: string | null;
    calls: number;
    started_at: number;
    ended_at: number;
    /**
     * facts 来源（t470_code_f001）：`index` 行按索引口径 emit，summaries 未变
     * 或回退循环永不降级覆盖；`fallback` 行才按库 mtime 重算。随 facts 进
     * scan-state 持久化（浅拷贝保留），跨重启语义不变。
     */
    origin: "index" | "fallback";
}

export interface AntigravityScanState {
    /** summaries.db 与各回退库路径 → mtimeMs（读失败也记，防每轮重试）。 */
    mtimes: Map<string, number>;
    /** 会话 id → 归因所用 facts（含来源 sessions 的上轮快照）。 */
    files: Map<string, { session_id: string; facts: AntigravityFacts }>;
}

export interface AntigravityScanResult {
    sessions: TokenStatsSessionUpsert[];
    daily: TokenStatsDailyUpsert[];
    records: AgentSessionUsageRecord[];
    new_state: AntigravityScanState;
    /**
     * 会话根目录不可读（缺失/无权限）时 true：索引行亦不 emit（locator
     * 按 conversations/<id>.db 定位，根缺失则行不可开）。
     */
    missing: boolean;
    /**
     * t345 AC-001 pattern：索引库损坏或个别回退库不可读。true 时仍返回
     * 已解析部分，collector 报 failed 而非 unavailable。
     */
    file_unreadable: boolean;
}

export function create_antigravity_scan_state(): AntigravityScanState {
    return { mtimes: new Map(), files: new Map() };
}

function truncate_title(text: string): string {
    const collapsed = text.replace(/\s+/g, " ").trim();
    if (collapsed === "") return "";
    return collapsed.length > MAX_TITLE_LEN ? collapsed.slice(0, MAX_TITLE_LEN) : collapsed;
}

/**
 * s035 实测 last_modified_time 形态解析：
 * - 数值：>1e12 视为 ms，否则视为 unix 秒。
 * - 文本："YYYY-MM-DD HH:mm:ss.fffffffff+TZ"（空格分隔、9 位小数、零日期
 *   "0001-01-01 …"）。小数截断到毫秒后按 ISO 解析。
 * 非法/零值返回 null，调用方回退文件 mtime。
 */
export function parse_antigravity_time(value: unknown): number | null {
    if (typeof value === "number") {
        if (!Number.isFinite(value) || value <= 0) return null;
        return value > 1_000_000_000_000 ? Math.floor(value) : Math.floor(value * 1000);
    }
    if (typeof value !== "string") return null;
    const text = value.trim();
    if (text === "" || text.startsWith("0001")) return null;
    const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(.*)$/.exec(text);
    if (!match) return null;
    const date = match[1] ?? "";
    const clock = match[2] ?? "";
    const fraction = (match[3] ?? "").slice(0, 3).padEnd(3, "0");
    const zone = match[4] ?? "";
    const parsed = Date.parse(`${date}T${clock}.${fraction}${zone}`);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
}

/** workspace_uris(JSON 数组，首个 file:// URI)→目录；非法/空返回 null。 */
export function directory_of_workspace_uris(value: unknown): string | null {
    if (typeof value !== "string" || value === "") return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(value) as unknown;
    } catch {
        return null;
    }
    if (!Array.isArray(parsed)) return null;
    const first = parsed.find((item): item is string => typeof item === "string" && item !== "");
    if (!first) return null;
    const stripped = first.startsWith("file://") ? first.slice("file://".length) : first;
    const trimmed = stripped.trim();
    return trimmed === "" ? null : trimmed;
}

function file_mtime_ms(file_path: string): number | null {
    try {
        return fs.statSync(file_path).mtimeMs;
    } catch {
        return null;
    }
}

interface SummaryRow {
    conversation_id: string;
    title: string;
    step_count: number;
    last_modified_time: unknown;
    workspace_uris: string;
}

function read_summaries(summaries_db: string): {
    rows: SummaryRow[];
    mtime: number | null;
    /** t470_code_f002：仅打开/查询异常为 false；空表合法为 true。 */
    ok: boolean;
} {
    const mtime = file_mtime_ms(summaries_db);
    if (mtime === null) return { rows: [], mtime: null, ok: true };
    let db: Database.Database | null = null;
    try {
        db = new Database(summaries_db, {
            readonly: true,
            ...(NATIVE_BINDING_PATH ? { nativeBinding: NATIVE_BINDING_PATH } : {}),
        });
        const rows = db
            .prepare(
                "SELECT conversation_id, title, step_count, last_modified_time, workspace_uris FROM conversation_summaries",
            )
            .all() as SummaryRow[];
        return { rows, mtime, ok: true };
    } catch {
        return { rows: [], mtime, ok: false };
    } finally {
        if (db) {
            try {
                db.close();
            } catch {
                // ignore
            }
        }
    }
}

function count_steps(conversation_db: string): number | null {
    let db: Database.Database | null = null;
    try {
        db = new Database(conversation_db, {
            readonly: true,
            ...(NATIVE_BINDING_PATH ? { nativeBinding: NATIVE_BINDING_PATH } : {}),
        });
        const row = db.prepare("SELECT COUNT(*) AS n FROM steps").get() as { n: unknown };
        return typeof row.n === "number" && Number.isFinite(row.n) && row.n >= 0
            ? Math.floor(row.n)
            : null;
    } catch {
        return null;
    } finally {
        if (db) {
            try {
                db.close();
            } catch {
                // ignore
            }
        }
    }
}

function facts_equal(a: AntigravityFacts, b: AntigravityFacts): boolean {
    return (
        a.title === b.title &&
        a.directory === b.directory &&
        a.calls === b.calls &&
        a.started_at === b.started_at &&
        a.ended_at === b.ended_at
    );
}

function list_conversation_dbs(root: string): { ids: string[]; ok: boolean } {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
        return { ids: [], ok: false };
    }
    const ids: string[] = [];
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".db")) continue;
        const id = entry.name.slice(0, -".db".length);
        if (id !== "") ids.push(id);
    }
    return { ids, ok: true };
}

/**
 * 扫描 antigravity 会话索引 + 回退库。
 * @param conversations_dir `.../antigravity-cli/conversations` 目录
 * @param summaries_db `.../antigravity-cli/conversation_summaries.db` 文件
 */
export function scan_antigravity_sessions(
    conversations_dir: string,
    summaries_db: string,
    env: TokenStatsEnv,
    prev: AntigravityScanState,
): AntigravityScanResult {
    const fresh: AntigravityScanState = { mtimes: new Map(), files: new Map() };
    const listed = list_conversation_dbs(conversations_dir);
    if (!listed.ok) {
        return {
            sessions: [],
            daily: [],
            records: [],
            new_state: prev,
            missing: true,
            file_unreadable: false,
        };
    }
    const ids_on_disk = new Set(listed.ids);
    const sessions: TokenStatsSessionUpsert[] = [];
    let file_unreadable = false;

    // 索引：mtime 变化（或首轮）才重读；读失败记 mtime 防每轮重试。
    const prev_summaries_mtime = prev.mtimes.get(summaries_db);
    const cur_summaries_mtime = file_mtime_ms(summaries_db);
    if (cur_summaries_mtime === null) {
        // 索引缺失：视为空索引，全量回退扫文件名（仍可发现）。
    } else if (prev_summaries_mtime === cur_summaries_mtime) {
        carry_index_entries(prev, fresh);
        fresh.mtimes.set(summaries_db, cur_summaries_mtime);
    } else {
        const read = read_summaries(summaries_db);
        fresh.mtimes.set(summaries_db, cur_summaries_mtime);
        // t470_code_f002：空表合法（零会话），仅读异常上报。
        if (!read.ok) file_unreadable = true;
        reconcile_index_rows(read.rows, conversations_dir, env, prev, fresh, sessions);
    }
    const indexed_ids = new Set(fresh_indexed_ids(fresh));
    if (
        reconcile_fallback_dbs(
            conversations_dir,
            env,
            ids_on_disk,
            indexed_ids,
            prev,
            fresh,
            sessions,
        )
    ) {
        file_unreadable = true;
    }
    return { sessions, daily: [], records: [], new_state: fresh, missing: false, file_unreadable };
}

/** fresh 中 origin=index 的会话 id 集合（回退循环的排除集）。 */
function fresh_indexed_ids(fresh: AntigravityScanState): string[] {
    const ids: string[] = [];
    for (const [session_id, entry] of fresh.files) {
        if (entry.facts.origin !== "fallback") ids.push(session_id);
    }
    return ids;
}

/**
 * summaries 未变：上轮 index 条目原样续存（零 emit），不论其库文件
 * 是否在场/是否被触碰（t470_code_f001：索引是变更信号，回退循环
 * 永不对 index 条目降级；缺库行保留，库出现后仍走索引口径）。
 */
function carry_index_entries(prev: AntigravityScanState, fresh: AntigravityScanState): void {
    for (const [session_id, entry] of prev.files) {
        if (entry.facts.origin === "fallback") continue;
        fresh.files.set(session_id, entry);
    }
}

function push_session(
    sessions: TokenStatsSessionUpsert[],
    env: TokenStatsEnv,
    session_id: string,
    facts: AntigravityFacts,
): void {
    sessions.push({
        id: session_id,
        source: "antigravity",
        env,
        model: null,
        title: facts.title,
        directory: facts.directory,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        calls: facts.calls,
        started_at: facts.started_at,
        ended_at: facts.ended_at,
    });
}

/** 索引行按索引口径重算；facts 变化才 emit。 */
function reconcile_index_rows(
    rows: SummaryRow[],
    conversations_dir: string,
    env: TokenStatsEnv,
    prev: AntigravityScanState,
    fresh: AntigravityScanState,
    sessions: TokenStatsSessionUpsert[],
): void {
    for (const row of rows) {
        const session_id = row.conversation_id;
        if (typeof session_id !== "string" || session_id === "") continue;
        const title_text = truncate_title(typeof row.title === "string" ? row.title : "");
        const title = title_text === "" ? null : title_text;
        const calls =
            typeof row.step_count === "number" &&
            Number.isFinite(row.step_count) &&
            row.step_count >= 0
                ? Math.floor(row.step_count)
                : 0;
        let moment = parse_antigravity_time(row.last_modified_time);
        moment ??= file_mtime_ms(path.join(conversations_dir, `${session_id}.db`)) ?? 0;
        const facts: AntigravityFacts = {
            title,
            directory: directory_of_workspace_uris(row.workspace_uris),
            calls,
            started_at: moment,
            ended_at: moment,
            origin: "index",
        };
        fresh.files.set(session_id, { session_id, facts });
        const old = prev.files.get(session_id);
        if (!old || !facts_equal(old.facts, facts)) {
            push_session(sessions, env, session_id, facts);
        }
    }
}

/**
 * 回退：有库文件但无索引口径归属的会话，按库 mtime 判定，calls 取
 * steps 行数。返回是否有不可读文件（t345 部分失败语义）。
 */
function reconcile_fallback_dbs(
    conversations_dir: string,
    env: TokenStatsEnv,
    ids_on_disk: Set<string>,
    indexed_ids: Set<string>,
    prev: AntigravityScanState,
    fresh: AntigravityScanState,
    sessions: TokenStatsSessionUpsert[],
): boolean {
    let unreadable = false;
    for (const session_id of [...ids_on_disk].sort()) {
        if (indexed_ids.has(session_id)) continue;
        const file_path = path.join(conversations_dir, `${session_id}.db`);
        const mtime = file_mtime_ms(file_path);
        if (mtime === null) {
            unreadable = true;
            continue;
        }
        const prev_entry = prev.files.get(session_id);
        if (prev.mtimes.get(file_path) === mtime && prev_entry) {
            fresh.mtimes.set(file_path, mtime);
            fresh.files.set(session_id, prev_entry);
            continue;
        }
        const counted = count_steps(file_path);
        fresh.mtimes.set(file_path, mtime);
        if (counted === null) {
            unreadable = true;
            continue;
        }
        const facts: AntigravityFacts = {
            title: null,
            directory: null,
            calls: counted,
            started_at: mtime,
            ended_at: mtime,
            origin: "fallback",
        };
        fresh.files.set(session_id, { session_id, facts });
        if (!prev_entry || !facts_equal(prev_entry.facts, facts)) {
            push_session(sessions, env, session_id, facts);
        }
    }
    return unreadable;
}
