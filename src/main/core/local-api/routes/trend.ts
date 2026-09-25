import type { IncomingMessage, ServerResponse } from "node:http";
import type { ObservationStore } from "../../observation/observation-store";
import { normalize_trend_query } from "../../query-contract";
import { build_trend_series, type TrendPoint } from "../../../../shared/lib/trend";
import { json_response, read_json_body, is_record } from "../http_helpers";

export async function handle_web_trend(
    req: IncomingMessage,
    url: URL,
    res: ServerResponse,
    store: ObservationStore,
): Promise<boolean> {
    // A116 / AC-006: 批量趋势端点，单次请求响应全部指标，杜绝前端 fan-out 并发风暴
    if (url.pathname === "/v1/trend/bulk") {
        let queries: {
            provider?: string | null | undefined;
            accountId?: string | null | undefined;
            metricId?: string | null | undefined;
            sourceInstanceId?: string | null | undefined;
            days?: number | string | null | undefined;
        }[] = [];

        if (req.method === "POST") {
            const body = await read_json_body(req, res);
            if (!body.ok) return true;
            if (!is_record(body.value) || !Array.isArray(body.value["queries"])) {
                json_response(res, 400, { error: "queries array required" });
                return true;
            }
            const queries_raw = body.value["queries"] as {
                provider?: string;
                accountId?: string;
                metricId?: string;
                sourceInstanceId?: string;
                days?: number | string;
            }[];
            queries = queries_raw;
        } else if (req.method === "GET") {
            const provider = url.searchParams.get("provider");
            const account_id = url.searchParams.get("accountId");
            const source_instance_id = url.searchParams.get("sourceInstanceId");
            const periods_raw = url.searchParams.get("periods");
            try {
                const periods = periods_raw
                    ? (JSON.parse(periods_raw) as { metric_id: string; days?: number }[])
                    : [];
                queries = periods.map((p) => ({
                    provider,
                    accountId: account_id,
                    sourceInstanceId: source_instance_id,
                    metricId: p.metric_id,
                    days: p.days,
                }));
            } catch {
                json_response(res, 400, { error: "Invalid periods JSON" });
                return true;
            }
        } else {
            return false;
        }

        const results = queries.map((q) => {
            const normalized = normalize_trend_query({
                provider: q.provider,
                account_id: q.accountId,
                metric_id: q.metricId,
                source_instance_id: q.sourceInstanceId,
                days: q.days !== undefined && q.days !== null ? String(q.days) : undefined,
            });
            if (!normalized.ok) {
                return { metric_id: q.metricId ?? "", series: [] };
            }
            const records = store.query_trend_series(
                normalized.value.provider,
                normalized.value.account_id,
                normalized.value.metric_id,
                normalized.value.source_instance_id,
                normalized.value.days,
            );
            return {
                metric_id: q.metricId ?? "",
                series: build_trend_series(records),
            };
        });

        json_response(res, 200, { results });
        return true;
    }

    if (url.pathname !== "/v1/trend") return false;
    if (req.method !== "GET") return false;
    const normalized = normalize_trend_query({
        provider: url.searchParams.get("provider"),
        account_id: url.searchParams.get("accountId"),
        metric_id: url.searchParams.get("metricId"),
        source_instance_id: url.searchParams.get("sourceInstanceId"),
        days: url.searchParams.get("days") ?? undefined,
    });
    if (!normalized.ok) {
        json_response(res, 400, { error: normalized.message, code: normalized.code });
        return true;
    }
    const records = store.query_trend_series(
        normalized.value.provider,
        normalized.value.account_id,
        normalized.value.metric_id,
        normalized.value.source_instance_id,
        normalized.value.days,
    );
    const series: (TrendPoint | null)[] = build_trend_series(records);
    json_response(res, 200, series);
    return true;
}
