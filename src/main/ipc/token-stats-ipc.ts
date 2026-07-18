import type { IpcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { TokenStatsStatus } from "../../shared/types/ipc";
import type {
    AgentSessionUsage,
    TokenStatsBucket,
    TokenStatsRecordFilters,
    TokenStatsSession,
} from "../../shared/types/token-stats";
import { ok, type IpcResult } from "./helpers";
import type { TokenStatsStore } from "../core/token-stats/token-stats-store";
import type { TokenStatsManager } from "../core/token-stats/manager";

export function registerTokenStatsIpc(
    ipc: IpcMain,
    deps: { store: TokenStatsStore; manager: TokenStatsManager },
): void {
    ipc.handle(
        IPC_CHANNELS.TOKEN_STATS_BUCKETS,
        (
            _event: unknown,
            filters?: {
                source?: string;
                env?: string;
                from_date?: string;
                to_date?: string;
            },
        ): IpcResult<TokenStatsBucket[]> => {
            return ok(deps.store.query_buckets(filters ?? {}));
        },
    );

    ipc.handle(
        IPC_CHANNELS.TOKEN_STATS_SESSIONS,
        (
            _event: unknown,
            filters?: {
                source?: string;
                env?: string;
                search?: string;
                limit?: number;
                offset?: number;
            },
        ): IpcResult<TokenStatsSession[]> => {
            return ok(deps.store.query_sessions(filters ?? {}));
        },
    );

    ipc.handle(
        IPC_CHANNELS.TOKEN_STATS_RECORDS,
        (_event: unknown, filters?: TokenStatsRecordFilters): IpcResult<AgentSessionUsage[]> => {
            return ok(deps.store.query_records(filters ?? {}));
        },
    );

    ipc.handle(IPC_CHANNELS.TOKEN_STATS_STATUS, (): IpcResult<TokenStatsStatus> => {
        return ok({
            running: deps.manager.is_running(),
            last_updated: deps.store.last_updated(),
        });
    });
}
