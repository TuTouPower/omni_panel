/**
 * 会话历史 IPC 注册（t210 对接层）。
 *
 * 通道组（决策 15）：
 * - SESSION_HISTORY_OPEN: 打开/聚焦历史窗口并发 SESSION_HISTORY_FOCUS 定位。
 * - SESSION_HISTORY_SUBSCRIBE: resolve_session_file 后注册订阅，watcher 触发时
 *   通过 SESSION_HISTORY_MESSAGES_UPDATED 把增量推到历史窗口。
 * - SESSION_HISTORY_UNSUBSCRIBE: 注销订阅。
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
    SessionHistorySubscriptionService,
    SessionLoc,
    SessionsProvider,
} from "../core/session-history/subscription-service";
import type { HistoryWindowController } from "../core/main-panel/history-window-controller";
import type { HistoryMessage } from "../core/session-history/types";

export interface SessionHistoryIpcDeps {
    readonly service: SessionHistorySubscriptionService;
    readonly history_window_controller: HistoryWindowController;
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
            deps.service.subscribe({
                ...loc,
                file_path: resolved.file_path,
                extractor_kind: resolved.extractor_kind,
                on_update: (messages: readonly HistoryMessage[]) => {
                    const win = deps.history_window_controller.get_window();
                    if (win && !win.isDestroyed()) {
                        win.webContents.send(IPC_CHANNELS.SESSION_HISTORY_MESSAGES_UPDATED, {
                            source: loc.source,
                            env: loc.env,
                            session_id: loc.session_id,
                            messages,
                        });
                    }
                },
            });
            return ok({ subscribed: true });
        },
    );

    ipc.handle(
        IPC_CHANNELS.SESSION_HISTORY_UNSUBSCRIBE,
        (event: IpcMainInvokeEvent, source: string, env: string, session_id: string): AnyResult => {
            assert_valid_sender(event);
            deps.service.unsubscribe(source, env as Env, session_id);
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
}
