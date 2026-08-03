import type { IpcMain, IpcMainInvokeEvent } from "electron";

import {
    IPC_CHANNELS,
    type TrendPoint,
    type TrendBulkRequest,
    type TrendBulkResponse,
} from "../../shared/types/ipc";
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
    ipc.handle(
        IPC_CHANNELS.TREND_GET_BULK,
        (event: IpcMainInvokeEvent, payload: TrendBulkRequest): IpcResult<TrendBulkResponse> => {
            assert_valid_sender(event);
            const series = payload.periods.map((period) => {
                const effective_days =
                    typeof period.days === "number" && period.days > 0
                        ? Math.floor(period.days)
                        : 7;
                const records = deps.store.query_trend_series(
                    payload.provider,
                    payload.account_id,
                    period.metric_id,
                    effective_days,
                );
                return {
                    metric_id: period.metric_id,
                    series: build_trend_series(records),
                };
            });
            return ok({ series });
        },
    );
}
