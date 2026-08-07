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
    SessionQueryFilters,
    SessionRow,
    SessionsProvider,
} from "../core/session-history/subscription-service";
import type { TokenStatsSession } from "../../shared/types/token-stats";
import type { HistoryMessage } from "../core/session-history/types";
import type {
    SessionHistorySearchContentLegacyRequest,
    SessionHistorySearchContentRequest,
    SessionHistorySearchContentResponse,
    SessionHistorySummariesRequest,
    SessionHistorySummariesResponse,
} from "../../shared/types/ipc";

export interface SessionHistoryIpcDeps {
    readonly service: SessionHistorySubscriptionService;
    /** 由 main 从 token-stats store 取 sessions 后映射注入。 */
    readonly sessions_provider: SessionsProvider;
    /** 显式 WSL 配置（wslDistro/wslUser）覆盖默认自动探测；缺省用 DEFAULT_LOCATOR_PATHS。 */
    readonly locator_paths?: LocatorPaths;
}

type AnyResult = IpcResult<unknown>;

type SearchContentRequest =
    | SessionHistorySearchContentRequest
    | SessionHistorySearchContentLegacyRequest;

function is_legacy_search_request(
    request: SearchContentRequest,
): request is SessionHistorySearchContentLegacyRequest {
    return "locs" in request;
}

function loc_of(source: string, env: string, session_id: string): SessionLoc {
    return { source, env: env as Env, session_id };
}

const CONTENT_SEARCH_PAGE_SIZE = 100;

function key_of(row: SessionRow): string {
    return `${row.source}|${row.env}|${row.id}`;
}

function legacy_row_of(loc: { source: string; env: string; session_id: string }): SessionRow {
    return {
        id: loc.session_id,
        source: loc.source,
        env: loc.env as Env,
        title: null,
        model: null,
        started_at: 0,
        ended_at: 0,
    };
}

function query_all_sessions(
    deps: SessionHistoryIpcDeps,
    filters: SessionQueryFilters,
): SessionRow[] {
    const rows: SessionRow[] = [];
    let offset = 0;
    let page = deps.sessions_provider({ ...filters, limit: CONTENT_SEARCH_PAGE_SIZE, offset });
    rows.push(...page);
    while (page.length === CONTENT_SEARCH_PAGE_SIZE) {
        offset += CONTENT_SEARCH_PAGE_SIZE;
        page = deps.sessions_provider({ ...filters, limit: CONTENT_SEARCH_PAGE_SIZE, offset });
        rows.push(...page);
    }
    return rows;
}

function content_search_candidates(
    deps: SessionHistoryIpcDeps,
    request: SearchContentRequest,
): SessionRow[] {
    if (is_legacy_search_request(request)) {
        return request.locs.map(legacy_row_of);
    }

    const filters: SessionQueryFilters = {
        ...(request.filters.sources ? { sources: [...request.filters.sources] } : {}),
        ...(request.filters.start_at !== undefined ? { start_at: request.filters.start_at } : {}),
        ...(request.filters.end_at !== undefined ? { end_at: request.filters.end_at } : {}),
    };
    return query_all_sessions(deps, filters);
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
        IPC_CHANNELS.SESSION_HISTORY_QUERY,
        (
            event: IpcMainInvokeEvent,
            source: string,
            env: string,
            session_id: string,
            options?: QueryOptions,
        ): IpcResult<QueryResult> => {
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
            const result = deps.service.query(
                {
                    source,
                    env: env as Env,
                    session_id,
                    file_path: resolved.file_path,
                    extractor_kind: resolved.extractor_kind,
                },
                options,
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
            const recent = deps.service.recent_sessions(
                source,
                env as Env,
                limit,
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
            const previous = content_search_controllers.get(event.sender.id);
            previous?.abort();
            const controller = new AbortController();
            content_search_controllers.set(event.sender.id, controller);

            try {
                const candidate_rows = content_search_candidates(deps, request);
                const metadata_rows =
                    is_legacy_search_request(request) || !request.filters.search
                        ? []
                        : query_all_sessions(deps, {
                              ...(request.filters.sources
                                  ? { sources: [...request.filters.sources] }
                                  : {}),
                              search: request.filters.search,
                              ...(request.filters.start_at !== undefined
                                  ? { start_at: request.filters.start_at }
                                  : {}),
                              ...(request.filters.end_at !== undefined
                                  ? { end_at: request.filters.end_at }
                                  : {}),
                          });
                const resolved_locs: ResolvedSessionLoc[] = [];
                for (const row of candidate_rows) {
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
                          request.keyword,
                          controller.signal,
                      )
                    : await deps.service.searchContent(resolved_locs, request.keyword);
                if (controller.signal.aborted) return ok({ hits: [], sessions: [] });
                const hit_keys = new Set(hits);
                const response_sessions: TokenStatsSession[] = [];
                const response_keys = new Set<string>();
                for (const row of [...metadata_rows, ...candidate_rows]) {
                    const key = key_of(row);
                    if (response_keys.has(key)) continue;
                    if (metadata_rows.includes(row) || (row.session && hit_keys.has(key))) {
                        response_keys.add(key);
                        if (row.session) response_sessions.push(row.session);
                    }
                }
                return ok({
                    hits: [...hit_keys],
                    sessions: response_sessions,
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
            const resolved_locs: ResolvedSessionLoc[] = [];
            for (const loc of request.locs) {
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
            const summaries = await deps.service.summaries(resolved_locs);
            return ok({ summaries });
        },
    );
}
