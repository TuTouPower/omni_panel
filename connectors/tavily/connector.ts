import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { ScriptObservation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

interface AccountPayload {
    readonly plan_limit?: unknown;
    readonly plan_usage?: unknown;
    readonly search_usage?: unknown;
    readonly crawl_usage?: unknown;
    readonly extract_usage?: unknown;
    readonly map_usage?: unknown;
    readonly research_usage?: unknown;
}

interface UsagePayload {
    readonly error?: string;
    readonly account?: AccountPayload;
}

function to_number(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function status_for_usage(used: number, limit: number): ScriptObservation["status"] {
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

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

async function main(): Promise<ScriptObservation[]> {
    const api_key = (ctx.params["API_KEY"] ?? "").trim();
    if (!api_key) return [];

    const response = (await ctx.http.get_json("default", "/usage", {
        headers: { Authorization: `Bearer ${api_key}` },
    })) as UsagePayload | null;

    if (response?.error) {
        throw new Error(`Tavily API 错误: ${response.error}`);
    }

    const account = response?.account;
    if (!is_record(account)) {
        throw new Error("Tavily API 返回格式异常: 缺少 account");
    }

    const plan_limit = to_number(account["plan_limit"]);
    if (plan_limit <= 0) {
        throw new Error("Tavily plan limit is 0 or negative — check your API key and subscription");
    }
    const plan_usage = Math.max(to_number(account["plan_usage"]), 0);
    const now = Date.now();
    const reset_at = next_month_start();

    const base = {
        provider: "tavily",
        account_id: "tavily",
        account_label: "Tavily",
        window: "month" as const,
        cycleDurationMs: 30 * 24 * 3_600_000,
        display_style: "ratio" as const,
        reset_at,
        observed_at: now,
        source: "poll" as const,
        stale: false,
        last_error: null,
    };

    const observations: ScriptObservation[] = [
        {
            ...base,
            metric_id: "tavily:total-month",
            raw_label: "total-month",
            normalized_label: "月用量",
            used: plan_usage,
            limit: plan_limit,
            status: status_for_usage(plan_usage, plan_limit),
        },
    ];

    const details: readonly (readonly [string, string, string, keyof AccountPayload])[] = [
        ["tavily:search", "search", "搜索", "search_usage"],
        ["tavily:crawl", "crawl", "爬取", "crawl_usage"],
        ["tavily:extract", "extract", "提取", "extract_usage"],
        ["tavily:map", "map", "地图", "map_usage"],
        ["tavily:research", "research", "研究", "research_usage"],
    ];

    for (const [metric_id, raw_label, normalized_label, key] of details) {
        const used = Math.max(to_number(account[key]), 0);
        if (used <= 0) continue;
        observations.push({
            ...base,
            metric_id,
            raw_label,
            normalized_label,
            used,
            limit: plan_limit,
            status: status_for_usage(used, plan_limit),
        });
    }

    return observations;
}

void main;
