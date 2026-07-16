import type { IpcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { TokenStatsBucket, TokenStatsSession } from "../../shared/types/token-stats";
import type { TokenStatsStore } from "../core/token-stats/token-stats-store";

export function registerTokenStatsIpc(ipc: IpcMain, deps: { store: TokenStatsStore }): void {
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
        ): TokenStatsBucket[] => {
            return deps.store.query_buckets(filters ?? {});
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
        ): TokenStatsSession[] => {
            return deps.store.query_sessions(filters ?? {});
        },
    );
}
