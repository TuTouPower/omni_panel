import type { IpcMain, IpcMainInvokeEvent } from "electron";

import {
    IPC_CHANNELS,
    type TrendPoint,
    type TrendBulkRequest,
    type TrendBulkResponse,
} from "../../shared/types/ipc";
import { build_trend_series } from "../../shared/lib/trend";
import { ok, fail, assert_valid_sender, type IpcResult } from "./helpers";
import type { ObservationStore } from "../core/observation/observation-store";
import { normalize_trend_bulk_query, normalize_trend_query } from "../core/query-contract";

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
            sourceInstanceId: string,
            days?: number,
        ): IpcResult<(TrendPoint | null)[]> => {
            assert_valid_sender(event);
            const normalized = normalize_trend_query({
                provider,
                account_id: accountId,
                metric_id: metricId,
                source_instance_id: sourceInstanceId,
                days,
            });
            if (!normalized.ok) return fail(normalized.code, normalized.message);
            const records = deps.store.query_trend_series(
                normalized.value.provider,
                normalized.value.account_id,
                normalized.value.metric_id,
                normalized.value.source_instance_id,
                normalized.value.days,
            );
            return ok(build_trend_series(records));
        },
    );
    ipc.handle(
        IPC_CHANNELS.TREND_GET_BULK,
        (event: IpcMainInvokeEvent, payload: TrendBulkRequest): IpcResult<TrendBulkResponse> => {
            assert_valid_sender(event);
            const normalized = normalize_trend_bulk_query(payload);
            if (!normalized.ok) return fail(normalized.code, normalized.message);
            const series = normalized.value.periods.map((period) => {
                const records = deps.store.query_trend_series(
                    normalized.value.provider,
                    normalized.value.account_id,
                    period.metric_id,
                    normalized.value.source_instance_id,
                    period.days,
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
