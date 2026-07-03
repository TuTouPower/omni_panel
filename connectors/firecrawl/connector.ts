import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { Observation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

function to_number(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

interface Usage {
    readonly used: number;
    readonly limit: number;
    readonly reset_at: number | null;
}

function extract_usage(response: unknown, remaining_key: string, plan_key: string): Usage {
    if (!is_record(response)) {
        throw new Error("Firecrawl API 返回格式异常: 期望对象");
    }
    if (response["success"] === false) {
        throw new Error(`Firecrawl API 报错: ${JSON.stringify(response["error"] ?? response)}`);
    }
    const data = response["data"];
    if (!is_record(data)) {
        throw new Error("Firecrawl API 返回格式异常: 缺少 data");
    }
    const plan = to_number(data[plan_key]);
    const remaining = to_number(data[remaining_key]);
    const period_end = data["billing_period_end"];
    const reset_at_ms = typeof period_end === "string" ? Date.parse(period_end) : Number.NaN;
    return {
        used: Math.max(plan - remaining, 0),
        limit: plan,
        reset_at: Number.isFinite(reset_at_ms) ? reset_at_ms : null,
    };
}

async function fetch_usage(
    path: string,
    api_key: string,
    remaining_key: string,
    plan_key: string,
): Promise<Usage> {
    const response = await ctx.http.get_json("default", path, {
        headers: { Authorization: `Bearer ${api_key}` },
    });
    return extract_usage(response, remaining_key, plan_key);
}

async function main(): Promise<Observation[]> {
    const api_key = (ctx.params["API_KEY"] ?? "").trim();
    if (!api_key) return [];

    const [credits, tokens] = await Promise.all([
        fetch_usage("/v1/team/credit-usage", api_key, "remaining_credits", "plan_credits"),
        fetch_usage("/v1/team/token-usage", api_key, "remaining_tokens", "plan_tokens"),
    ]);

    const now = Date.now();
    const base = {
        provider: "firecrawl",
        source_instance_id: "firecrawl",
        account_id: "firecrawl",
        account_label: "Firecrawl",
        window: "month" as const,
        display_style: "ratio" as const,
        reset_at: credits.reset_at,
        observed_at: now,
        source: "poll" as const,
        stale: false,
        last_error: null,
        status: "normal" as const,
    };

    return [
        {
            ...base,
            metric_id: "firecrawl:credits-total",
            raw_label: "credits",
            normalized_label: "积分",
            used: credits.used,
            limit: credits.limit,
        },
        {
            ...base,
            metric_id: "firecrawl:tokens-total",
            raw_label: "tokens",
            normalized_label: "Tokens",
            used: tokens.used,
            limit: tokens.limit,
        },
    ];
}

void main;
