/**
 * 会话历史订阅 / watcher 服务纯逻辑层（t210）。
 *
 * 职责：
 * - 维护订阅表 (source, env, session_id) → 单个订阅，每订阅一个源文件监听器。
 * - 监听策略（决策 5）：
 *   - win + claude_code（本地 JSONL）→ fs.watch；
 *   - opencode（SQLite）+ kimi/grok（WSL 9P）→ 2s mtime 轮询。
 * - 变化时调对应 t209 提取器做增量提取，推 messages 给订阅方 on_update。
 * - query：全量提取 + 内存切片分页（决策 17 后端部分）。
 * - recent_sessions：经注入的 sessions_provider 回调取数，按 ended_at 降序、limit 截断，
 *   映射为统一会话定位，agent 由 source 派生（与 token-stats dashboard 一致）。
 *
 * 全程只读：服务层不开写句柄，提取器已保证 readonly 打开源文件 / db。
 * 容错：watcher 抛错或文件被删时不向外抛，记日志，停止该订阅 watcher。
 */
import { statSync, watch, type FSWatcher } from "node:fs";
import {
    extract_claude_code,
    extract_claude_code_first_user,
    extract_claude_code_incremental,
} from "./claude-code-extractor";
import { extract_grok, extract_grok_first_user, extract_grok_incremental } from "./grok-extractor";
import {
    extract_kimi_code,
    extract_kimi_code_first_user,
    extract_kimi_code_incremental,
} from "./kimi-extractor";
import {
    extract_opencode,
    extract_opencode_first_user,
    extract_opencode_incremental,
} from "./opencode-extractor";
import type { ExtractCursor, ExtractResult, HistoryMessage } from "./types";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import { createLogger } from "../../../shared/lib/logger";

const log = createLogger("session-history-subscription");

/** 端类型，与 t209 四端提取器一一对应。 */
export type ExtractorKind = "claude_code" | "opencode" | "kimi" | "grok";

/** 运行环境，对齐 token-stats 的 TokenStatsEnv。 */
export type Env = "win" | "wsl";

/** 订阅键组成部分：source 与 extractor_kind 同形，但保留独立字段以便后续多实例分离。 */
export interface SessionLoc {
    readonly source: string;
    readonly env: Env;
    readonly session_id: string;
}

export interface ResolvedSessionLoc extends SessionLoc {
    /** 源文件 / db 路径（claude_code/kimi/grok 是 JSONL 文件，opencode 是 .db 文件）。 */
    readonly file_path: string;
    readonly extractor_kind: ExtractorKind;
}

export interface SubscribeParams extends ResolvedSessionLoc {
    /**
     * 订阅方身份（不透明字符串）。同一 loc 下每个订阅方独立收推送（t219 多窗口路由）；
     * 缺省为 legacy 单订阅，路由由调用方 on_update 决定（未绑定窗口的 fallback）。
     */
    readonly subscriber_id?: string;
    /** 检测到变化时调，推送增量消息（仅含新增，不含已推送过的）。 */
    readonly on_update: (messages: readonly HistoryMessage[]) => void;
}

export interface QueryOptions {
    /** 限制返回最近 N 条；缺省全量。 */
    readonly limit?: number;
    /** 向前分页游标（取此游标之前的消息）。null 表示从最新开始。 */
    readonly before_cursor?: ExtractCursor | null;
}

export interface QueryResult {
    readonly messages: readonly HistoryMessage[];
    /** 下次向前分页用游标；null 表示已到顶无更多。 */
    readonly next_cursor: ExtractCursor | null;
}

/**
 * 由 IPC 层注入的会话查询回调。返回值由 IPC 层从 token-stats store 取后映射。
 * 服务层不直接依赖 token-stats store。
 */
export interface SessionQueryFilters {
    readonly source?: string;
    readonly sources?: readonly string[];
    readonly env?: string;
    readonly search?: string;
    readonly start_at?: number;
    readonly end_at?: number;
    readonly order_by?: "ended_at" | "tokens" | "calls" | "started_at";
    readonly direction?: "asc" | "desc";
    readonly limit?: number;
    readonly offset?: number;
}

export type SessionsProvider = (
    filters_or_source: SessionQueryFilters | string,
    env?: Env,
) => readonly SessionRow[];

/** sessions_provider 返回的单行；服务层只关心定位所需字段。 */
export interface SessionRow {
    readonly id: string;
    readonly source: string;
    readonly env: Env;
    readonly title: string | null;
    /** token-stats 多模型会话聚合的主模型名（用于取 agent 显示）。 */
    readonly model: string | null;
    readonly started_at: number;
    readonly ended_at: number;
    /** Full token-stats row when content-search results need renderer metadata. */
    readonly session?: TokenStatsSession;
}

/** 最近会话查询返回项。 */
export interface RecentSession {
    readonly source: string;
    readonly env: Env;
    readonly session_id: string;
    readonly title: string | null;
    /** 由 source 派生（source.replace(/_/g, "-")），与 dashboard agent 一致。 */
    readonly agent: string;
}

interface Watcher {
    /** 释放底层句柄（fs.watch close 或 clearInterval）。幂等。 */
    readonly stop: () => void;
}

interface SubscriberEntry {
    on_update: (messages: readonly HistoryMessage[]) => void;
}

interface Subscription {
    readonly loc: SessionLoc;
    readonly file_path: string;
    readonly extractor_kind: ExtractorKind;
    /** 订阅方列表：subscriber_id → 回调。同 loc 多订阅方各自收推送（t219）。 */
    subscribers: Map<string, SubscriberEntry>;
    cursor: ExtractCursor | null;
    /** true 表示已收到过至少一次全量提取结果。 */
    initialized: boolean;
    watcher: Watcher | null;
}

interface ExtractCacheEntry {
    file_path: string;
    extractor_kind: ExtractorKind;
    mtime_ms: number;
    size: number;
    messages: HistoryMessage[];
    cursor: ExtractCursor | null;
}

function safe_stat(file_path: string): { mtime_ms: number; size: number } | null {
    try {
        const st = statSync(file_path);
        return { mtime_ms: st.mtimeMs, size: st.size };
    } catch {
        return null;
    }
}

/** 未指定 subscriber_id 的订阅统一使用此 id（legacy 单订阅，路由由调用方决定）。 */
const LEGACY_SUBSCRIBER_ID = "__legacy__";

function loc_key(loc: SessionLoc): string {
    return `${loc.source}|${loc.env}|${loc.session_id}`;
}

/**
 * 选择监听策略。决策 5：
 * - win + claude_code → fs.watch；
 * - 其余（wsl 任意 / opencode sqlite / kimi / grok 9P）→ 2s 轮询 mtime。
 */
export function pick_strategy(env: Env, extractor_kind: ExtractorKind): "watch" | "poll" {
    if (env === "win" && extractor_kind === "claude_code") return "watch";
    return "poll";
}

export function create_watcher(
    file_path: string,
    strategy: "watch" | "poll",
    on_change: () => void,
    poll_interval_ms = 2000,
): Watcher {
    if (strategy === "watch") {
        let watcher: FSWatcher | null = null;
        try {
            watcher = watch(file_path, (event) => {
                if (event === "change") on_change();
            });
            watcher.on("error", (err) => {
                log.warn(`fs.watch error on ${file_path}: ${String(err)}`);
            });
        } catch (err) {
            // 文件尚不存在等情况：退化为轮询，保证文件出现后能感知。
            log.warn(`fs.watch unavailable for ${file_path}, falling back to poll: ${String(err)}`);
            return create_watcher(file_path, "poll", on_change);
        }
        return {
            stop: () => {
                try {
                    watcher?.close();
                } catch {
                    // ignore
                }
                watcher = null;
            },
        };
    }

    // 2s mtime 轮询
    let last_mtime: number | null = null;
    try {
        last_mtime = statSync(file_path).mtimeMs;
    } catch {
        last_mtime = null;
    }
    const timer = setInterval(() => {
        let cur: number | null;
        try {
            cur = statSync(file_path).mtimeMs;
        } catch {
            cur = null;
        }
        if (cur !== last_mtime) {
            last_mtime = cur;
            if (cur !== null) on_change();
        }
    }, poll_interval_ms);
    return {
        stop: () => {
            clearInterval(timer);
        },
    };
}

/**
 * 限制并发的任务调度器。同一时刻最多允许 `limit` 个 async 任务运行，
 * 新任务在前面的任务 resolve/reject 后依次启动。 abortSignal 用于在启动前短路。
 */
function with_concurrency_limit<T>(
    tasks: readonly (() => T | Promise<T>)[],
    limit: number,
    abortSignal?: AbortSignal,
): Promise<T[]> {
    return new Promise((resolve, reject) => {
        const results: T[] = [];
        let running = 0;
        let index = 0;
        let rejected = false;

        function start_next(): void {
            if (rejected) return;
            if (abortSignal?.aborted) {
                // 已中断：不再启动新任务，等已运行任务自然结束。
                if (running === 0) {
                    resolve(results);
                }
                return;
            }
            if (index >= tasks.length) {
                if (running === 0) {
                    resolve(results);
                }
                return;
            }
            while (running < limit && index < tasks.length) {
                if (abortSignal?.aborted) {
                    if (running === 0) {
                        resolve(results);
                    }
                    return;
                }
                const idx = index;
                const task = tasks[idx];
                if (!task) break;
                index += 1;
                running += 1;
                Promise.resolve(task())
                    .then((value) => {
                        if (!rejected) {
                            results[idx] = value;
                        }
                    })
                    .catch((err: unknown) => {
                        if (!rejected) {
                            rejected = true;
                            reject(err instanceof Error ? err : new Error(String(err)));
                        }
                    })
                    .finally(() => {
                        running -= 1;
                        if (!rejected) {
                            start_next();
                        }
                    });
            }
        }

        start_next();
    });
}

/**
 * 会话历史订阅服务。无外部依赖（除 fs + 提取器 + logger），可在主进程或测试中实例化。
 *
 * 不持有 Electron IPC / BrowserWindow 引用，IPC 注册由调用方完成。
 */
export class SessionHistorySubscriptionService {
    private readonly subscriptions = new Map<string, Subscription>();
    private readonly extract_cache = new Map<string, ExtractCacheEntry>();
    private readonly poll_interval_ms: number;

    constructor(options: { poll_interval_ms?: number } = {}) {
        this.poll_interval_ms = options.poll_interval_ms ?? 2000;
    }

    /** 调对应提取器做全量提取。 */
    protected extract_full(
        extractor_kind: ExtractorKind,
        file_path: string,
        session_id: string,
    ): ExtractResult {
        switch (extractor_kind) {
            case "claude_code":
                return extract_claude_code(file_path);
            case "opencode":
                return extract_opencode(file_path, session_id);
            case "kimi":
                return extract_kimi_code(file_path);
            case "grok":
                return extract_grok(file_path);
        }
    }

    /** 调对应提取器做增量提取。 */
    protected extract_incremental(
        extractor_kind: ExtractorKind,
        file_path: string,
        session_id: string,
        cursor: ExtractCursor | null,
    ): ExtractResult {
        switch (extractor_kind) {
            case "claude_code":
                // claude_code 增量签名要求 cursor 非空；cursor 为 null 时退全量。
                return cursor
                    ? extract_claude_code_incremental(file_path, cursor)
                    : extract_claude_code(file_path);
            case "opencode":
                return extract_opencode_incremental(file_path, session_id, cursor);
            case "kimi":
                return cursor
                    ? extract_kimi_code_incremental(file_path, cursor)
                    : extract_kimi_code(file_path);
            case "grok":
                return cursor
                    ? extract_grok_incremental(file_path, cursor)
                    : extract_grok(file_path);
        }
    }

    /** 轻量取某 session 首条 user 消息文本。 */
    protected extract_first_user(
        extractor_kind: ExtractorKind,
        file_path: string,
        session_id: string,
    ): string {
        switch (extractor_kind) {
            case "claude_code":
                return extract_claude_code_first_user(file_path);
            case "opencode":
                return extract_opencode_first_user(file_path, session_id);
            case "kimi":
                return extract_kimi_code_first_user(file_path);
            case "grok":
                return extract_grok_first_user(file_path);
        }
    }

    private get_extract_cache(key: string, file_path: string): ExtractCacheEntry | null {
        const cached = this.extract_cache.get(key);
        if (cached?.file_path !== file_path) return null;
        const st = safe_stat(file_path);
        if (st?.mtime_ms !== cached.mtime_ms || st.size !== cached.size) return null;
        return cached;
    }

    private set_extract_cache(
        key: string,
        file_path: string,
        extractor_kind: ExtractorKind,
        result: { messages: readonly HistoryMessage[]; cursor: ExtractCursor | null },
    ): void {
        const st = safe_stat(file_path);
        this.extract_cache.set(key, {
            file_path,
            extractor_kind,
            mtime_ms: st?.mtime_ms ?? 0,
            size: st?.size ?? 0,
            messages: [...result.messages],
            cursor: result.cursor,
        });
    }

    private refresh_cache_after_change(sub: Subscription, new_messages: HistoryMessage[]): void {
        const key = loc_key(sub.loc);
        const cached = this.extract_cache.get(key);
        const st = safe_stat(sub.file_path);
        if (cached?.file_path === sub.file_path) {
            cached.messages = [...cached.messages, ...new_messages];
            cached.cursor = sub.cursor;
            if (st) {
                cached.mtime_ms = st.mtime_ms;
                cached.size = st.size;
            }
        } else {
            const full = this.extract_full(sub.extractor_kind, sub.file_path, sub.loc.session_id);
            this.set_extract_cache(key, sub.file_path, sub.extractor_kind, full);
        }
    }

    /**
     * 注册订阅。幂等：同 (source,env,session_id,subscriber_id) 重复 subscribe 不重启
     * watcher，只更新 on_update；如 watcher 已死则重建。同 loc 不同 subscriber_id 并存，
     * 各自收推送（t219 多窗口路由）。
     * 文件不存在不立即报错（轮询策略会在文件出现后开始触发）。
     */
    subscribe(params: SubscribeParams): string {
        const key = loc_key(params);
        const subscriber_id = params.subscriber_id ?? LEGACY_SUBSCRIBER_ID;
        const existing = this.subscriptions.get(key);
        if (existing) {
            existing.subscribers.set(subscriber_id, { on_update: params.on_update });
            existing.watcher ??= this.start_watcher(existing);
            return key;
        }

        // 订阅时立即做一次全量提取建立 cursor，但不向 on_update 推送——
        // 首次拉取由调用方走 query 通道；watcher 只在订阅之后的追加发生时推增量。
        // 优先复用同文件缓存，避免 subscribe 后立即 query 重复解析同一文件。
        const cached = this.get_extract_cache(key, params.file_path);
        const initial =
            cached ?? this.extract_full(params.extractor_kind, params.file_path, params.session_id);
        if (!cached) {
            this.set_extract_cache(key, params.file_path, params.extractor_kind, initial);
        }
        const sub: Subscription = {
            loc: {
                source: params.source,
                env: params.env,
                session_id: params.session_id,
            },
            file_path: params.file_path,
            extractor_kind: params.extractor_kind,
            subscribers: new Map([[subscriber_id, { on_update: params.on_update }]]),
            cursor: initial.cursor,
            initialized: true,
            watcher: null,
        };
        this.subscriptions.set(key, sub);
        sub.watcher = this.start_watcher(sub);
        return key;
    }

    /** 启动 watcher 并绑定变化回调。返回 watcher 实例。 */
    private start_watcher(sub: Subscription): Watcher {
        const strategy = pick_strategy(sub.loc.env, sub.extractor_kind);
        const watcher = create_watcher(
            sub.file_path,
            strategy,
            () => {
                this.handle_change(sub);
            },
            this.poll_interval_ms,
        );
        return watcher;
    }

    /** watcher 触发：增量提取并推新增。失败不向外抛，记日志。 */
    private handle_change(sub: Subscription): void {
        let messages: readonly HistoryMessage[] = [];
        try {
            const result = this.extract_incremental(
                sub.extractor_kind,
                sub.file_path,
                sub.loc.session_id,
                sub.cursor,
            );
            sub.cursor = result.cursor;
            messages = result.messages;
        } catch (err) {
            log.warn(`extract failed for ${sub.file_path} (${sub.extractor_kind}): ${String(err)}`);
            return;
        }
        if (messages.length === 0) return;
        this.refresh_cache_after_change(sub, [...messages]);
        // t219 多订阅方：逐订阅方隔离，单个 on_update 抛错不剥夺其余订阅方推送。
        for (const entry of sub.subscribers.values()) {
            try {
                entry.on_update(messages);
            } catch (err) {
                log.warn(
                    `subscriber on_update failed for ${sub.file_path} (${sub.extractor_kind}): ${String(err)}`,
                );
            }
        }
    }

    /**
     * 注销订阅。带 subscriber_id 只移除该订阅方（map 空则停 watcher 删 key）；
     * 缺省移除该 loc 全部订阅（legacy 语义）。
     */
    unsubscribe(source: string, env: Env, session_id: string, subscriber_id?: string): void {
        const key = loc_key({ source, env, session_id });
        const sub = this.subscriptions.get(key);
        if (!sub) return;
        if (subscriber_id !== undefined) {
            sub.subscribers.delete(subscriber_id);
            if (sub.subscribers.size > 0) return;
        }
        sub.watcher?.stop();
        sub.watcher = null;
        this.subscriptions.delete(key);
    }

    /** 注销全部订阅，释放所有 watcher 句柄（窗口关闭时调）。 */
    unsubscribe_all(): void {
        for (const sub of this.subscriptions.values()) {
            sub.watcher?.stop();
            sub.watcher = null;
        }
        this.subscriptions.clear();
    }

    /**
     * 主动查询：全量提取 + 内存切片分页。
     * - limit 缺省：返回全量。
     * - before_cursor 缺省/null：返回最近 limit 条（取全量末尾）。
     * - before_cursor 提供（pagination 形态）：取游标绝对下标之前的 limit 条。
     *
     * 由于提取器是追加型，追加只发生在末尾，前缀下标跨追加稳定：游标编码
     * 「已返回页最早消息在全量数组中的绝对下标」而非累计计数或消息 id，
     * 活跃会话翻页时新追加消息不会挤入更早页（无重复无遗漏），空/重复 id 不跳段。
     */
    query(
        params: {
            readonly source: string;
            readonly env: Env;
            readonly session_id: string;
            readonly file_path: string;
            readonly extractor_kind: ExtractorKind;
        },
        options?: QueryOptions,
    ): QueryResult {
        const key = loc_key(params);
        const cached = this.get_extract_cache(key, params.file_path);
        const full =
            cached ?? this.extract_full(params.extractor_kind, params.file_path, params.session_id);
        if (!cached) {
            this.set_extract_cache(key, params.file_path, params.extractor_kind, full);
        }
        const all = full.messages;
        const limit = options?.limit;

        if (limit === undefined) {
            return { messages: all, next_cursor: null };
        }

        let end = all.length;
        const cursor = options?.before_cursor;
        if (cursor?.kind === "pagination") {
            // 追加型：前缀下标稳定，直接以绝对下标定位；钳制到当前长度防御。
            end = Math.min(cursor.end_index, all.length);
            if (end < 0) {
                return { messages: [], next_cursor: null };
            }
        }
        const start = Math.max(0, end - limit);
        const slice = all.slice(start, end);

        if (start <= 0) {
            return { messages: slice, next_cursor: null };
        }
        const next_cursor: ExtractCursor = {
            kind: "pagination",
            end_index: start,
        };
        return { messages: slice, next_cursor };
    }

    /**
     * 最近会话查询。由 IPC 层注入 sessions_provider（封装 token-stats store 查询），
     * 服务层不直接依赖 store。返回按 ended_at 降序、limit 截断的会话定位。
     */
    recent_sessions(
        source: string,
        env: Env,
        limit: number,
        sessions_provider: SessionsProvider,
    ): RecentSession[] {
        const rows = sessions_provider(source, env);
        // provider 已按 ended_at DESC 返回（token-stats store 默认），保险起见再排一次。
        const sorted = [...rows].sort((a, b) => b.ended_at - a.ended_at);
        const sliced = sorted.slice(0, limit);
        return sliced.map((row) => ({
            source: row.source,
            env: row.env,
            session_id: row.id,
            title: row.title,
            agent: row.source.replace(/_/g, "-"),
        }));
    }

    /**
     * 批量内容搜索：对候选会话集合做一次性关键词扫描，返回命中的 loc key 集合。
     * 优先复用 extract_cache；未缓存时按 concurrency（默认 3）限制同时解析的源文件数。
     * abortSignal 置位后不再启动新 loc，已运行任务继续到当前 loc 完成。
     */
    async searchContent(
        locs: readonly ResolvedSessionLoc[],
        keyword: string,
        options?: { concurrency?: number; abortSignal?: AbortSignal },
    ): Promise<Set<string>> {
        const q = keyword.toLowerCase();
        const hits = new Set<string>();
        const concurrency = options?.concurrency ?? 3;

        const tasks = locs.map((loc) => (): void => {
            if (options?.abortSignal?.aborted) return;
            const key = loc_key(loc);
            const cached = this.get_extract_cache(key, loc.file_path);
            let messages: readonly HistoryMessage[];
            if (cached) {
                messages = cached.messages;
            } else {
                const full = this.extract_full(loc.extractor_kind, loc.file_path, loc.session_id);
                this.set_extract_cache(key, loc.file_path, loc.extractor_kind, full);
                messages = full.messages;
            }
            if (messages.some((m) => m.text.toLowerCase().includes(q))) {
                hits.add(key);
            }
        });

        await with_concurrency_limit(tasks, concurrency, options?.abortSignal);
        return hits;
    }

    /** IPC-facing variant that preserves the service's AbortSignal contract. */
    searchContentWithAbort(
        locs: readonly ResolvedSessionLoc[],
        keyword: string,
        abortSignal: AbortSignal,
    ): Promise<Set<string>> {
        return this.searchContent(locs, keyword, { abortSignal });
    }

    /**
     * 批量首条用户消息摘要：返回 loc key → 首条 user 文本前 80 字符。
     * 优先复用 extract_cache；未缓存时调用各端轻量 first_user 扫描（不触发全量提取）。
     * concurrency 默认 5。
     */
    async summaries(
        locs: readonly ResolvedSessionLoc[],
        options?: { concurrency?: number },
    ): Promise<Record<string, string>> {
        const result: Record<string, string> = {};
        const concurrency = options?.concurrency ?? 5;

        const tasks = locs.map((loc) => (): void => {
            const key = loc_key(loc);
            const cached = this.get_extract_cache(key, loc.file_path);
            let text = "";
            if (cached) {
                const first = cached.messages.find((m) => m.role === "user");
                text = first?.text ?? "";
            } else {
                text = this.extract_first_user(loc.extractor_kind, loc.file_path, loc.session_id);
            }
            result[key] = text.slice(0, 80);
        });

        await with_concurrency_limit(tasks, concurrency);
        return result;
    }
}
