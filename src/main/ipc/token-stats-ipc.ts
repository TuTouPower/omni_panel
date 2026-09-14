import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { TokenStatsStatus } from "../../shared/types/ipc";
import type {
    AgentSessionUsage,
    TokenStatsBucket,
    TokenStatsHeatmapFilters,
    TokenStatsHourFilters,
    TokenStatsRecordFilters,
    TokenStatsRollupFilters,
    TokenStatsSession,
    TokenStatsSessionFilters,
    TokenStatsSessionStats,
    TokenStatsDashboardDto,
    TokenStatsDashboardSessionsDto,
} from "../../shared/types/token-stats";
import {
    tokenStatsDashboardDtoSchema,
    tokenStatsDashboardQuerySchema,
    tokenStatsDashboardSessionsDtoSchema,
    tokenStatsDashboardSessionsQuerySchema,
} from "../../shared/types/token-stats";
import { ok, fail, assert_valid_sender, type IpcResult } from "./helpers";
import type { TokenStatsStore } from "../core/token-stats/token-stats-store";
import type { TokenStatsManager } from "../core/token-stats/manager";
import type { TokenStatsQueryDispatcher } from "../core/token-stats/query-dispatcher";
import {
    ensure_dashboard_sources_status,
    validate_token_stats_record_filters,
    validate_token_stats_session_filters,
} from "../core/query-contract";

export function registerTokenStatsIpc(
    ipc: IpcMain,
    deps: {
        store: TokenStatsStore;
        manager: TokenStatsManager;
        dispatcher: TokenStatsQueryDispatcher;
    },
): void {
    ipc.handle(
        IPC_CHANNELS.TOKEN_STATS_BUCKETS,
        (
            event: IpcMainInvokeEvent,
            filters?: {
                source?: string;
                env?: string;
                from_date?: string;
                to_date?: string;
            },
        ): IpcResult<TokenStatsBucket[]> => {
            assert_valid_sender(event);
            return ok(deps.store.query_buckets(filters ?? {}));
        },
    );

    ipc.handle(
        IPC_CHANNELS.TOKEN_STATS_SESSIONS,
        (
            event: IpcMainInvokeEvent,
            filters?: TokenStatsSessionFilters,
        ): IpcResult<TokenStatsSession[]> => {
            assert_valid_sender(event);
            const validation = validate_token_stats_session_filters(filters);
            if (!validation.ok) return fail(validation.code, validation.message);
            return ok(deps.store.query_sessions(filters ?? {}));
        },
    );

    ipc.handle(
        IPC_CHANNELS.TOKEN_STATS_SESSION_STATS,
        (event: IpcMainInvokeEvent): IpcResult<TokenStatsSessionStats> => {
            assert_valid_sender(event);
            return ok(deps.store.query_session_stats());
        },
    );

    ipc.handle(
        IPC_CHANNELS.TOKEN_STATS_RECORDS,
        (
            event: IpcMainInvokeEvent,
            filters?: TokenStatsRecordFilters,
        ): IpcResult<AgentSessionUsage[]> => {
            assert_valid_sender(event);
            const validation = validate_token_stats_record_filters(filters);
            if (!validation.ok) return fail(validation.code, validation.message);
            return ok(deps.store.query_records(filters ?? {}));
        },
    );

    ipc.handle(
        IPC_CHANNELS.TOKEN_STATS_HEATMAP,
        (
            event: IpcMainInvokeEvent,
            filters?: TokenStatsHeatmapFilters,
        ): IpcResult<ReturnType<TokenStatsStore["query_heatmap"]>> => {
            assert_valid_sender(event);
            return ok(deps.store.query_heatmap(filters ?? {}));
        },
    );

    ipc.handle(
        IPC_CHANNELS.TOKEN_STATS_HOUR_BUCKETS,
        (
            event: IpcMainInvokeEvent,
            filters?: TokenStatsHourFilters,
        ): IpcResult<ReturnType<TokenStatsStore["query_hour_buckets"]>> => {
            assert_valid_sender(event);
            return ok(deps.store.query_hour_buckets(filters ?? {}));
        },
    );

    ipc.handle(
        IPC_CHANNELS.TOKEN_STATS_ROLLUP,
        (
            event: IpcMainInvokeEvent,
            filters?: TokenStatsRollupFilters,
        ): IpcResult<ReturnType<TokenStatsStore["query_range_rollup"]>> => {
            assert_valid_sender(event);
            return ok(deps.store.query_range_rollup(filters ?? {}));
        },
    );

    ipc.handle(
        IPC_CHANNELS.TOKEN_STATS_DASHBOARD,
        async (
            event: IpcMainInvokeEvent,
            raw_query: unknown,
        ): Promise<IpcResult<TokenStatsDashboardDto>> => {
            assert_valid_sender(event);
            const parsed_query = tokenStatsDashboardQuerySchema.safeParse(raw_query);
            if (!parsed_query.success) {
                return fail("INVALID_ARGUMENT", "Invalid token stats dashboard query");
            }
            try {
                // The query runs in the isolated read-only worker (t193) so
                // heavy aggregate reads never block the main process.
                const status = {
                    running: deps.manager.is_running(),
                    last_updated: deps.store.last_updated(),
                };
                // t309/t476: 把最新一轮源级采集状态并入 status 快照透传给
                // query worker 与面板；没有采集报告时也固定返回空数组。
                const source_statuses = deps.store.sources_status();
                const status_snapshot = { ...status, sources_status: source_statuses };
                const dto = await deps.dispatcher.request_dashboard(
                    parsed_query.data,
                    status_snapshot,
                );
                const dto_with_status = ensure_dashboard_sources_status(
                    dto,
                    status_snapshot.sources_status,
                );
                const parsed_dto = tokenStatsDashboardDtoSchema.safeParse(dto_with_status);
                if (!parsed_dto.success) {
                    return fail("INVALID_RESPONSE", "Invalid token stats dashboard response");
                }
                return ok(parsed_dto.data);
            } catch {
                return fail("QUERY_FAILED", "Token stats dashboard query failed");
            }
        },
    );

    ipc.handle(
        IPC_CHANNELS.TOKEN_STATS_STATUS,
        (event: IpcMainInvokeEvent): IpcResult<TokenStatsStatus> => {
            assert_valid_sender(event);
            return ok({
                running: deps.manager.is_running(),
                last_updated: deps.store.last_updated(),
            });
        },
    );

    ipc.handle(
        IPC_CHANNELS.TOKEN_STATS_DASHBOARD_SESSIONS,
        (
            event: IpcMainInvokeEvent,
            raw_query: unknown,
        ): IpcResult<TokenStatsDashboardSessionsDto> => {
            assert_valid_sender(event);
            const parsed_query = tokenStatsDashboardSessionsQuerySchema.safeParse(raw_query);
            if (!parsed_query.success) {
                return fail("INVALID_ARGUMENT", "Invalid token stats sessions query");
            }
            try {
                const dto = deps.store.query_dashboard_sessions(parsed_query.data);
                const parsed_dto = tokenStatsDashboardSessionsDtoSchema.safeParse(dto);
                if (!parsed_dto.success) {
                    return fail("INVALID_RESPONSE", "Invalid token stats sessions response");
                }
                return ok(parsed_dto.data);
            } catch {
                return fail("QUERY_FAILED", "Token stats sessions query failed");
            }
        },
    );

    // t434: 手动刷新——触发一轮 collector collect 并重置自动采集计时。
    ipc.handle(
        IPC_CHANNELS.TOKEN_STATS_FORCE_COLLECT,
        (event: IpcMainInvokeEvent): IpcResult<null> => {
            assert_valid_sender(event);
            try {
                deps.manager.force_collect();
                return ok(null);
            } catch {
                return fail("COLLECT_FAILED", "Token stats collect failed to trigger");
            }
        },
    );
}
