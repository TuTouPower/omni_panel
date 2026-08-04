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
            filters?: {
                source?: string;
                env?: string;
                search?: string;
                limit?: number;
                offset?: number;
            },
        ): IpcResult<TokenStatsSession[]> => {
            assert_valid_sender(event);
            return ok(deps.store.query_sessions(filters ?? {}));
        },
    );

    ipc.handle(
        IPC_CHANNELS.TOKEN_STATS_RECORDS,
        (
            event: IpcMainInvokeEvent,
            filters?: TokenStatsRecordFilters,
        ): IpcResult<AgentSessionUsage[]> => {
            assert_valid_sender(event);
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
                const dto = await deps.dispatcher.request_dashboard(parsed_query.data, status);
                const parsed_dto = tokenStatsDashboardDtoSchema.safeParse(dto);
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
}
