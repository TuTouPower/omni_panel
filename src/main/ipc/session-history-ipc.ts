/**
 * 会话历史 IPC 注册（t210 对接层；t219 推送按订阅方窗口路由）。
 *
 * 通道组（决策 15）：
 * - SESSION_HISTORY_OPEN: 打开/聚焦历史窗口并发 SESSION_HISTORY_FOCUS 定位。
 * - SESSION_HISTORY_SUBSCRIBE: resolve_session_file 后注册订阅，watcher 触发时
 *   通过 SESSION_HISTORY_MESSAGES_UPDATED 把增量推到发起订阅的窗口（t219，
 *   以 event.sender 为订阅方身份，多窗口互不串扰）。
 * - SESSION_HISTORY_UNSUBSCRIBE: 注销调用方窗口的订阅。
 * - SESSION_HISTORY_QUERY: 全量/分页拉取（5s 兜底由 renderer 调用）。
 * - SESSION_HISTORY_RECENT: 最近会话列表（按 ended_at 降序，limit 截断）。
 *
 * 全部 handler 加 assert_valid_sender；resolve 失败返回 fail。
 */
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import { ok, fail, assert_valid_sender, type IpcResult } from "./helpers";
import {
    resolve_session_file,
    type HistorySource,
    type LocatorPaths,
} from "../core/session-history/session-locator";
import type {
    Env,
    QueryOptions,
    QueryResult,
    RecentSession,
    ResolvedSessionLoc,
    SessionHistorySubscriptionService,
    SessionLoc,
    SessionRow,
    SessionsProvider,
} from "../core/session-history/subscription-service";
import type { TokenStatsSession } from "../../shared/types/token-stats";
import type { HistoryMessage } from "../core/session-history/types";
import type {
    SessionHistorySearchContentResponse,
    SessionHistorySummariesRequest,
    SessionHistorySummariesResponse,
} from "../../shared/types/ipc";
import {
    content_search_candidates,
    content_search_range,
    is_legacy_search_request,
    normalize_recent_query,
    normalize_session_history_query,
    normalize_summary_locs,
    query_all_sessions,
    search_content_filters,
    validate_search_content_request,
    type SessionHistorySearchRequest,
} from "../core/query-contract";
import { execute_commandcode_resume } from "../core/session-history/resume";

export interface SessionHistoryIpcDeps {
    readonly service: SessionHistorySubscriptionService;
    /** 由 main 从 token-stats store 取 sessions 后映射注入。 */
    readonly sessions_provider: SessionsProvider;
    /** 显式 WSL 配置（wslDistro/wslUser）覆盖默认自动探测；缺省用 DEFAULT_LOCATOR_PATHS。 */
    readonly locator_paths?: LocatorPaths;
}

type AnyResult = IpcResult<unknown>;

type SearchContentRequest = SessionHistorySearchRequest;

function loc_of(source: string, env: string, session_id: string): SessionLoc {
    return { source, env: env as Env, session_id };
}

function key_of(row: SessionRow): string {
    return `${row.source}|${row.env}|${row.id}`;
}

export function registerSessionHistoryIpc(ipc: IpcMain, deps: SessionHistoryIpcDeps): void {
    const content_search_controllers = new Map<number, AbortController>();

    // SESSION_HISTORY_OPEN 在 main/index.ts 单点注册（参照 TOKEN_STATS_OPEN 模式），
    // 因需要直接持有 history_window_controller 实例，且无 IpcResult 包装（fire-and-forget）。
    ipc.handle(
        IPC_CHANNELS.SESSION_HISTORY_SUBSCRIBE,
        (event: IpcMainInvokeEvent, source: string, env: string, session_id: string): AnyResult => {
            assert_valid_sender(event);
            const resolved = resolve_session_file(
                source as HistorySource,
                env as Env,
                session_id,
                deps.locator_paths,
            );
            if (!resolved) {
                return fail("SESSION_NOT_FOUND", "session file not found");
            }
            const loc = loc_of(source, env, session_id);
            // t219：以 event.sender（发起订阅的窗口 webContents）为订阅方身份。
            // 同一会话被多个窗口订阅时各自独立收推送；订阅方窗口销毁即注销该订阅（无泄漏）。
            const subscriber_id = String(event.sender.id);
            deps.service.subscribe({
                ...loc,
                file_path: resolved.file_path,
                extractor_kind: resolved.extractor_kind,
                subscriber_id,
                on_update: (messages: readonly HistoryMessage[]) => {
                    if (!event.sender.isDestroyed()) {
                        event.sender.send(IPC_CHANNELS.SESSION_HISTORY_MESSAGES_UPDATED, {
                            source: loc.source,
                            env: loc.env,
                            session_id: loc.session_id,
                            messages,
                        });
                    }
                },
            });
            event.sender.once("destroyed", () => {
                deps.service.unsubscribe(source, env as Env, session_id, subscriber_id);
            });
            return ok({ subscribed: true });
        },
    );

    ipc.handle(
        IPC_CHANNELS.SESSION_HISTORY_UNSUBSCRIBE,
        (event: IpcMainInvokeEvent, source: string, env: string, session_id: string): AnyResult => {
            assert_valid_sender(event);
            // 只注销调用方窗口的订阅，不误伤同会话其他订阅方。
            deps.service.unsubscribe(source, env as Env, session_id, String(event.sender.id));
            return ok({ unsubscribed: true });
        },
    );

    ipc.handle(
        IPC_CHANNELS.SESSION_HISTORY_RESUME,
        (event: IpcMainInvokeEvent, source: string, env: string, session_id: string): AnyResult => {
            assert_valid_sender(event);
            if (
                source !== "commandcode" ||
                (env !== "linux" && env !== "mac") ||
                typeof session_id !== "string" ||
                session_id === ""
            ) {
                return fail("INVALID_REQUEST", "Command Code resume requires a local platform");
            }
            const resolved = resolve_session_file(
                "commandcode",
                env,
                session_id,
                deps.locator_paths,
            );
            if (!resolved) return fail("SESSION_NOT_FOUND", "session file not found");
            try {
                return ok(execute_commandcode_resume(session_id));
            } catch {
                return fail("RESUME_FAILED", "failed to start Command Code");
            }
        },
    );

    ipc.handle(
        IPC_CHANNELS.SESSION_HISTORY_QUERY,
        (
            event: IpcMainInvokeEvent,
            source: string,
            env: string,
            session_id: string,
            options?: QueryOptions,
        ): IpcResult<QueryResult> => {
            assert_valid_sender(event);
            const normalized = normalize_session_history_query({
                id: session_id,
                source,
                env,
                options,
            });
            if (!normalized.ok) return fail(normalized.code, normalized.message);
            const resolved = resolve_session_file(
                normalized.value.source as HistorySource,
                normalized.value.env,
                normalized.value.session_id,
                deps.locator_paths,
            );
            if (!resolved) {
                return fail("SESSION_NOT_FOUND", "session file not found");
            }
            const result = deps.service.query(
                {
                    source: normalized.value.source,
                    env: normalized.value.env,
                    session_id: normalized.value.session_id,
                    file_path: resolved.file_path,
                    extractor_kind: resolved.extractor_kind,
                },
                normalized.value.options,
            );
            return ok(result);
        },
    );

    ipc.handle(
        IPC_CHANNELS.SESSION_HISTORY_RECENT,
        (
            event: IpcMainInvokeEvent,
            source: string,
            env: string,
            limit: number,
        ): IpcResult<RecentSession[]> => {
            assert_valid_sender(event);
            const normalized = normalize_recent_query({ source, env, limit });
            if (!normalized.ok) return fail(normalized.code, normalized.message);
            const recent = deps.service.recent_sessions(
                normalized.value.source,
                normalized.value.env,
                normalized.value.limit,
                deps.sessions_provider,
            );
            return ok(recent);
        },
    );

    ipc.handle(
        IPC_CHANNELS.SESSION_HISTORY_SEARCH_CONTENT,
        async (
            event: IpcMainInvokeEvent,
            request: SearchContentRequest,
        ): Promise<IpcResult<SessionHistorySearchContentResponse>> => {
            assert_valid_sender(event);
            const validated = validate_search_content_request(request);
            if (!validated.ok) return fail(validated.code, validated.message);
            const normalized_request = validated.value;
            const previous = content_search_controllers.get(event.sender.id);
            previous?.abort();
            const controller = new AbortController();
            content_search_controllers.set(event.sender.id, controller);

            try {
                const candidates = content_search_candidates(
                    deps.sessions_provider,
                    normalized_request,
                );
                const candidate_rows = candidates.rows;
                // t404: 仅 resolve/extract 本批候选 slice；省略 limit 时 end=total（全量兼容）。
                const range = content_search_range(candidate_rows.length, normalized_request);
                const batch_rows = candidate_rows.slice(range.offset, range.end);
                const metadata_filters = search_content_filters(normalized_request, true);
                const metadata =
                    range.offset > 0 ||
                    is_legacy_search_request(normalized_request) ||
                    !metadata_filters.search
                        ? { rows: [] as SessionRow[], truncated: false }
                        : query_all_sessions(deps.sessions_provider, metadata_filters);
                const metadata_rows = metadata.rows;
                const resolved_locs: ResolvedSessionLoc[] = [];
                for (const row of batch_rows) {
                    if (controller.signal.aborted) break;
                    const resolved = resolve_session_file(
                        row.source as HistorySource,
                        row.env,
                        row.id,
                        deps.locator_paths,
                    );
                    if (!resolved) continue;
                    resolved_locs.push({
                        source: row.source,
                        env: row.env,
                        session_id: row.id,
                        file_path: resolved.file_path,
                        extractor_kind: resolved.extractor_kind,
                    });
                }

                const service_with_abort = deps.service as unknown as {
                    readonly searchContentWithAbort?: (
                        locs: readonly ResolvedSessionLoc[],
                        keyword: string,
                        abortSignal: AbortSignal,
                    ) => Promise<Set<string>>;
                };
                const hits = service_with_abort.searchContentWithAbort
                    ? await service_with_abort.searchContentWithAbort(
                          resolved_locs,
                          normalized_request.keyword,
                          controller.signal,
                      )
                    : await deps.service.searchContent(resolved_locs, normalized_request.keyword);
                if (controller.signal.aborted)
                    return ok({
                        hits: [],
                        sessions: [],
                        truncated: false,
                        progress: {
                            scanned: range.scanned,
                            total: range.total,
                            done: range.done,
                            next_offset: range.next_offset,
                        },
                    });
                const hit_keys = new Set(hits);
                // t354 AC-001: metadata 行预构建 key Set 替代 includes 线性扫描（原
                // includes 对 metadata 数组元素引用恒真、对 candidate 行 O(n·m) 查询），
                // 语义等价（同引用必有同 key）。
                // t404: 本批 sessions = 首批 metadata 命中 ∪ 本 slice 内容命中。
                const metadata_keys = new Set(metadata_rows.map(key_of));
                const response_sessions: TokenStatsSession[] = [];
                const response_keys = new Set<string>();
                for (const row of [...metadata_rows, ...batch_rows]) {
                    const key = key_of(row);
                    if (response_keys.has(key)) continue;
                    if (metadata_keys.has(key) || (row.session && hit_keys.has(key))) {
                        response_keys.add(key);
                        if (row.session) response_sessions.push(row.session);
                    }
                }
                return ok({
                    hits: [...hit_keys],
                    sessions: response_sessions,
                    truncated: candidates.truncated || metadata.truncated,
                    progress: {
                        scanned: range.scanned,
                        total: range.total,
                        done: range.done,
                        next_offset: range.next_offset,
                    },
                });
            } finally {
                if (content_search_controllers.get(event.sender.id) === controller) {
                    content_search_controllers.delete(event.sender.id);
                }
            }
        },
    );

    ipc.handle(
        IPC_CHANNELS.SESSION_HISTORY_SUMMARIES,
        async (
            event: IpcMainInvokeEvent,
            request: SessionHistorySummariesRequest,
        ): Promise<IpcResult<SessionHistorySummariesResponse>> => {
            assert_valid_sender(event);
            const normalized = normalize_summary_locs(request);
            if (!normalized.ok) return fail(normalized.code, normalized.message);
            const resolved_locs: ResolvedSessionLoc[] = [];
            for (const loc of normalized.value) {
                const resolved = resolve_session_file(
                    loc.source as HistorySource,
                    loc.env as Env,
                    loc.session_id,
                    deps.locator_paths,
                );
                if (!resolved) continue;
                resolved_locs.push({
                    source: loc.source,
                    env: loc.env as Env,
                    session_id: loc.session_id,
                    file_path: resolved.file_path,
                    extractor_kind: resolved.extractor_kind,
                });
            }
            const summaries = await deps.service.summaries(resolved_locs, {
                mode: request.mode === "last" ? "last" : "first",
            });
            return ok({ summaries });
        },
    );
}
