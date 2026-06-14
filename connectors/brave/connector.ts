import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { Observation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

function status_for_usage(used: number, limit: number): Observation["status"] {
    if (limit <= 0) return "normal";
    const ratio = used / limit;
    if (ratio >= 0.9) return "critical";
    if (ratio >= 0.75) return "warning";
    return "normal";
}

function next_month_start(): number {
    const now = new Date();
    const year = now.getUTCMonth() + 1 <= 11 ? now.getUTCFullYear() : now.getUTCFullYear() + 1;
    const month = (now.getUTCMonth() + 1) % 12;
    return Date.UTC(year, month, 1, 0, 0, 0);
}

function to_number(value: string | undefined): number {
    if (value === undefined) return NaN;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
}

async function main(): Promise<Observation[]> {
    const api_key = (ctx.params["API_KEY"] ?? "").trim();
    if (!api_key) return [];

    const response = await ctx.http.get_raw("default", "/res/v1/web/search?q=test&count=1", {
        headers: { "X-Subscription-Token": api_key },
    });

    const limit = to_number(response.headers["x-ratelimit-limit"]);
    const remaining = to_number(response.headers["x-ratelimit-remaining"]);

    if (Number.isNaN(limit) || Number.isNaN(remaining)) return [];

    const used = Math.max(limit - remaining, 0);
    const now = Date.now();
    const reset_at = next_month_start();

    return [
        {
            provider: "brave",
            source_instance_id: "brave",
            account_id: "brave",
            account_label: "Brave Search",
            metric_id: "brave:monthly-queries",
            name: "本月查询",
            window: "month",
            used,
            limit,
            display_style: "ratio",
            reset_at,
            status: status_for_usage(used, limit),
            observed_at: now,
            source: "probe",
            stale: false,
            last_error: null,
        },
    ];
}

void main;
