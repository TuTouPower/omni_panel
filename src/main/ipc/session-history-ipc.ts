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
    SessionsProvider,
} from "../core/session-history/subscription-service";
import type { HistoryMessage } from "../core/session-history/types";
import type {
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

function loc_of(source: string, env: string, session_id: string): SessionLoc {
    return { source, env: env as Env, session_id };
}

export function registerSessionHistoryIpc(ipc: IpcMain, deps: SessionHistoryIpcDeps): void {
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
            request: SessionHistorySearchContentRequest,
        ): Promise<IpcResult<SessionHistorySearchContentResponse>> => {
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
            const hits = await deps.service.searchContent(resolved_locs, request.keyword);
            return ok({ hits: [...hits] });
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
