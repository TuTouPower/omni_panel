import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { ScriptObservation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function to_number(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

/** 返回有效预算（>0）；缺失/非数/≤0 返回 0（表示无预算，status 走 unknown）。 */
function parse_limit(raw: string | undefined): number {
    if (raw === undefined || raw.trim() === "") return 0;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

function status_for_cost(used: number, limit: number): ScriptObservation["status"] {
    const ratio = used / limit;
    if (ratio >= 0.9) return "critical";
    if (ratio >= 0.75) return "warning";
    return "normal";
}

function to_ms(value: unknown): number | null {
    if (typeof value !== "string") return null;
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : null;
}

async function main(): Promise<ScriptObservation[]> {
    const service_key = (ctx.params["SERVICE_KEY"] ?? "").trim();
    const api_key_id = (ctx.params["API_KEY_ID"] ?? "").trim();
    if (!service_key || !api_key_id) return [];

    const limit_num = parse_limit(ctx.params["LIMIT"]);
    const limit: number | null = limit_num > 0 ? limit_num : null;
    const now = Date.now();

    const response = await ctx.http.get_json(
        "default",
        `/team-management/api-keys/${encodeURIComponent(api_key_id)}/usage`,
        { headers: { "x-api-key": service_key, Accept: "application/json" } },
    );

    if (!is_record(response)) {
        throw new Error("Exa API 返回格式异常: 期望对象");
    }

    const total = to_number(response["total_cost_usd"]);
    const period = response["period"];
    const period_start = to_ms(is_record(period) ? period["start"] : undefined);
    const period_end = to_ms(is_record(period) ? period["end"] : undefined);
    const cycleDurationMs =
        period_start !== null && period_end !== null && period_end > period_start
            ? period_end - period_start
            : null;

    const api_key_name = response["api_key_name"];
    const base = {
        provider: "exa",
        account_id: api_key_id,
        account_label: typeof api_key_name === "string" ? api_key_name : "Exa",
        window: "total" as const,
        cycleDurationMs,
        display_style: "ratio" as const,
        reset_at: period_end,
        observed_at: now,
        source: "poll" as const,
        stale: false,
        last_error: null,
    };

    const observations: ScriptObservation[] = [
        {
            ...base,
            metric_id: "exa:total_cost_usd",
            raw_label: "total_cost_usd",
            normalized_label: "总成本 (USD)",
            used: round2(total),
            limit,
            status: limit_num > 0 ? status_for_cost(total, limit_num) : "unknown",
        },
    ];

    const breakdown = response["cost_breakdown"];
    if (Array.isArray(breakdown)) {
        for (const item of breakdown) {
            if (!is_record(item)) continue;
            const amount = to_number(item["amount_usd"]);
            const price_id = typeof item["price_id"] === "string" ? item["price_id"] : "unknown";
            const price_name =
                typeof item["price_name"] === "string" ? item["price_name"] : price_id;
            observations.push({
                ...base,
                metric_id: `exa:${price_id}`,
                raw_label: price_id,
                normalized_label: price_name,
                used: round2(amount),
                limit: null,
                status: "unknown",
            });
        }
    }

    return observations;
}

void main;
