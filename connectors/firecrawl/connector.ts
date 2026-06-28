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

async function main(): Promise<Observation[]> {
    const api_key = (ctx.params["API_KEY"] ?? "").trim();
    if (!api_key) return [];

    const response = await ctx.http.get_json("default", "/team/token-usage", {
        headers: { Authorization: `Bearer ${api_key}` },
    });

    if (!is_record(response)) {
        throw new Error("Firecrawl API 返回格式异常: 缺少 usage 对象");
    }

    const now = Date.now();
    const base = {
        provider: "firecrawl",
        source_instance_id: "firecrawl",
        account_id: "firecrawl",
        account_label: "Firecrawl",
        window: "month" as const,
        display_style: "ratio" as const,
        reset_at: null,
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
            used: Math.max(to_number(response["credits"]), 0),
            limit: null,
        },
        {
            ...base,
            metric_id: "firecrawl:tokens-total",
            raw_label: "tokens",
            normalized_label: "Tokens",
            used: Math.max(to_number(response["tokens"]), 0),
            limit: null,
        },
    ];
}

void main;
