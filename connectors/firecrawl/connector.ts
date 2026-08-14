import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { ScriptObservation } from "../../src/shared/types/observation";

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
    // t361: 无时区日期显式按 ISO8601/UTC 处理（Date.parse 缺时区按本地时区解析错误）。
    const normalized_end =
        typeof period_end === "string" && !/([zZ]|[+-]\d{2}:?\d{2})$/.test(period_end.trim())
            ? `${period_end}Z`
            : period_end;
    const reset_at_ms =
        typeof normalized_end === "string" ? Date.parse(normalized_end) : Number.NaN;
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

async function main(): Promise<ScriptObservation[]> {
    const api_key = (ctx.params["API_KEY"] ?? "").trim();
    if (!api_key) return [];

    // t363 AC-002: 单接口失败不拖垮另一接口——allSettled + 成功侧照常产出。
    const [credits_res, tokens_res] = await Promise.allSettled([
        fetch_usage("/v1/team/credit-usage", api_key, "remaining_credits", "plan_credits"),
        fetch_usage("/v1/team/token-usage", api_key, "remaining_tokens", "plan_tokens"),
    ]);
    if (credits_res.status === "rejected") {
        ctx.report_failed_account(
            "firecrawl",
            "firecrawl",
            "Firecrawl",
            String(credits_res.reason),
        );
    }
    if (tokens_res.status === "rejected") {
        ctx.report_failed_account("firecrawl", "firecrawl", "Firecrawl", String(tokens_res.reason));
    }
    const credits = credits_res.status === "fulfilled" ? credits_res.value : null;
    const tokens = tokens_res.status === "fulfilled" ? tokens_res.value : null;

    const now = Date.now();
    const base = {
        provider: "firecrawl",
        account_id: "firecrawl",
        account_label: "Firecrawl",
        window: "month" as const,
        cycleDurationMs: 30 * 24 * 3_600_000,
        display_style: "ratio" as const,
        observed_at: now,
        source: "poll" as const,
        stale: false,
        last_error: null,
    };

    const observations: ScriptObservation[] = [];
    if (credits) {
        observations.push({
            ...base,
            metric_id: "firecrawl:credits-total",
            raw_label: "credits",
            normalized_label: "积分",
            used: credits.used,
            limit: credits.limit,
            // t361: 各指标用各自 reset_at（原复用 credits 致 tokens 观测 reset_at 错误）。
            reset_at: credits.reset_at,
            status: ctx.status.for_ratio(credits.used, credits.limit),
        });
    }
    if (tokens) {
        observations.push({
            ...base,
            metric_id: "firecrawl:tokens-total",
            raw_label: "tokens",
            normalized_label: "Tokens",
            used: tokens.used,
            limit: tokens.limit,
            reset_at: tokens.reset_at,
            status: ctx.status.for_ratio(tokens.used, tokens.limit),
        });
    }
    return observations;
}

void main;
