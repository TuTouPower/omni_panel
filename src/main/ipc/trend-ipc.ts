import type { IpcMain, IpcMainInvokeEvent } from "electron";

import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { TrendPoint } from "../../shared/types/ipc";
import { build_trend_series } from "../../shared/lib/trend";
import { ok, assert_valid_sender, type IpcResult } from "./helpers";
import type { ObservationStore } from "../core/observation/observation-store";

export interface TrendIpcDeps {
    store: ObservationStore;
}

export function registerTrendIpc(ipc: IpcMain, deps: TrendIpcDeps): void {
    ipc.handle(
        IPC_CHANNELS.TREND_GET,
        (
            event: IpcMainInvokeEvent,
            provider: string,
            accountId: string,
            metricId: string,
            days?: number,
        ): IpcResult<(TrendPoint | null)[]> => {
            assert_valid_sender(event);
            // Math.floor for parity with /v1/trend in local-api/server.ts (fractional
            // days must be truncated, not passed through, so both paths agree).
            const effective_days = typeof days === "number" && days > 0 ? Math.floor(days) : 7;
            const records = deps.store.query_trend_series(
                provider,
                accountId,
                metricId,
                effective_days,
            );
            return ok(build_trend_series(records));
        },
    );
}
