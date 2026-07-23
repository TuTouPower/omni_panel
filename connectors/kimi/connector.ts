import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { ScriptObservation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

interface UsageDetail {
    readonly limit?: string;
    readonly used?: string;
    readonly remaining?: string;
    readonly resetTime?: string;
}

interface RateLimitWindow {
    readonly window?: { readonly duration?: number; readonly timeUnit?: string };
    readonly detail?: UsageDetail;
}

interface KimiUsageResponse {
    readonly usage?: UsageDetail;
    readonly limits?: readonly RateLimitWindow[];
}

function to_number(value: string | undefined): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function parse_reset_time(iso: string | undefined): number | null {
    if (!iso) return null;
    const ts = new Date(iso).getTime();
    return Number.isFinite(ts) ? ts : null;
}

function status_for_percent(used: number, limit: number): ScriptObservation["status"] {
    if (limit <= 0) return "normal";
    const pct = (used / limit) * 100;
    if (pct >= 90) return "critical";
    if (pct >= 75) return "warning";
    return "normal";
}

async function main(): Promise<ScriptObservation[]> {
    const api_key = (ctx.params["API_KEY"] ?? "").trim();
    if (!api_key) throw new Error("Missing required secret: API_KEY");

    const response = (await ctx.http.get_json("default", "coding/v1/usages", {
        headers: {
            Authorization: `Bearer ${api_key}`,
            "User-Agent": "KimiCLI/1.6",
        },
    })) as KimiUsageResponse | null;

    const now = Date.now();
    const results: ScriptObservation[] = [];

    // 周用量（usage）
    if (response?.usage) {
        const u = response.usage;
        const used = to_number(u.used);
        const limit = to_number(u.limit);
        const reset_at = parse_reset_time(u.resetTime);
        const cycle_duration_ms = 7 * 24 * 60 * 60 * 1000;

        results.push({
            provider: "kimi",
            account_id: "kimi",
            account_label: "Kimi",
            metric_id: "kimi:weekly",
            raw_label: "weekly",
            normalized_label: "一周",
            window: "day",
            cycleDurationMs: cycle_duration_ms,
            used,
            limit,
            display_style: "percent",
            reset_at,
            status: status_for_percent(used, limit),
            observed_at: now,
            source: "poll",
            stale: false,
            last_error: null,
        });
    }

    // 5 小时限额（limits[0]，duration=300 分钟）
    const rate_limit = response?.limits?.[0];
    if (rate_limit?.detail) {
        const d = rate_limit.detail;
        const used = to_number(d.used);
        const limit = to_number(d.limit);
        const reset_at = parse_reset_time(d.resetTime);
        const cycle_duration_ms = 5 * 60 * 60 * 1000;

        results.push({
            provider: "kimi",
            account_id: "kimi",
            account_label: "Kimi",
            metric_id: "kimi:five_hour",
            raw_label: "five_hour",
            normalized_label: "5小时",
            window: "second",
            cycleDurationMs: cycle_duration_ms,
            used,
            limit,
            display_style: "percent",
            reset_at,
            status: status_for_percent(used, limit),
            observed_at: now,
            source: "poll",
            stale: false,
            last_error: null,
        });
    }

    if (results.length === 0) {
        throw new Error("Kimi API 返回无用量数据");
    }

    return results;
}

void main;
