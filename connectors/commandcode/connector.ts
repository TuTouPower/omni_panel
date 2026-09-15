import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { ScriptObservation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

interface WhoamiResponse {
    readonly user?: {
        readonly id?: string;
        readonly userName?: string;
        readonly name?: string;
        readonly email?: string;
    };
}

interface WindowLimit {
    readonly used?: number | string;
    readonly cap?: number | string;
    readonly exceeded?: boolean;
    readonly resetAt?: string | number;
}

interface CreditsResponse {
    readonly credits?: {
        readonly monthlyCredits?: number | string;
        readonly belowThreshold?: boolean;
    };
    readonly windowLimits?: {
        readonly fiveHour?: WindowLimit;
        readonly weekly?: WindowLimit;
    };
}

interface SubscriptionsResponse {
    readonly data?: {
        readonly planId?: string;
        readonly currentPeriodEnd?: string;
    };
}

const PLAN_MONTHLY_CAP: Record<string, number> = {
    "individual-go": 10,
    "individual-goat": 70,
    "individual-pro": 30,
    "individual-pro-v1": 80,
    "individual-provider": 15,
    "individual-max": 150,
    "individual-ultra": 300,
    "teams-pro": 40,
};

function plan_label(plan_id: string | undefined): string | null {
    if (!plan_id) return null;
    let clean = plan_id;
    for (const prefix of ["individual-", "teams-"]) {
        if (clean.startsWith(prefix)) {
            clean = clean.slice(prefix.length);
            break;
        }
    }
    return clean ? clean.toUpperCase() : null;
}

function to_number(value: unknown, fallback = 0): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
}

function parse_reset_time(value: unknown): number | null {
    if (value === undefined || value === null) return null;
    if (typeof value === "number") {
        if (!Number.isFinite(value) || value <= 0) return null;
        return value < 1e11 ? Math.round(value * 1000) : Math.round(value);
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const num = Number(trimmed);
        if (!Number.isNaN(num) && Number.isFinite(num) && num > 0) {
            return num < 1e11 ? Math.round(num * 1000) : Math.round(num);
        }
        const parsed = Date.parse(trimmed);
        return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
}

async function main(): Promise<ScriptObservation[]> {
    const api_key = (ctx.params["API_KEY"] ?? "").trim();
    if (!api_key) {
        throw new Error("Missing required secret: API_KEY");
    }

    const now = Date.now();
    const headers: Record<string, string> = {
        Authorization: `Bearer ${api_key}`,
        "User-Agent": "curl/8.7.1",
        Accept: "application/json",
    };

    try {
        const [whoami_res, credits_res, sub_res] = await Promise.allSettled([
            ctx.http.get_json("default", "/alpha/whoami", { headers }),
            ctx.http.get_json("default", "/alpha/billing/credits", { headers }),
            ctx.http.get_json("default", "/alpha/billing/subscriptions", { headers }),
        ]);

        if (credits_res.status === "rejected") {
            throw credits_res.reason;
        }

        const whoami = (
            whoami_res.status === "fulfilled" ? whoami_res.value : {}
        ) as WhoamiResponse;
        const credits_data = credits_res.value as CreditsResponse;
        const sub_data = (
            sub_res.status === "fulfilled" ? sub_res.value : {}
        ) as SubscriptionsResponse;

        const user = whoami.user;
        const user_name = user?.userName ?? user?.name ?? user?.email;
        const plan_id = sub_data.data?.planId;
        const plan_tag = plan_label(plan_id);
        const account_id = user?.id ?? user_name ?? "commandcode";
        const account_label = user_name
            ? plan_tag
                ? `${user_name} (${plan_tag})`
                : user_name
            : "Command Code";

        const results: ScriptObservation[] = [];

        // 1. Monthly credits
        const monthly_remaining =
            credits_data.credits?.monthlyCredits !== undefined
                ? to_number(credits_data.credits.monthlyCredits)
                : null;
        const monthly_cap =
            plan_id && PLAN_MONTHLY_CAP[plan_id] !== undefined ? PLAN_MONTHLY_CAP[plan_id] : null;
        const current_period_end = parse_reset_time(sub_data.data?.currentPeriodEnd);

        if (monthly_remaining !== null) {
            const is_below_threshold = Boolean(credits_data.credits?.belowThreshold);
            let status: ScriptObservation["status"] = "normal";
            if (is_below_threshold) {
                status = "warning";
            } else if (monthly_cap !== null && monthly_cap > 0) {
                status = ctx.status.for_ratio(monthly_remaining, monthly_cap);
            }

            results.push({
                provider: "commandcode",
                account_id,
                account_label,
                metric_id: "commandcode:monthly",
                raw_label: "monthly",
                normalized_label: "月额度",
                window: "month",
                cycleDurationMs: 30 * 24 * 60 * 60 * 1000,
                used: monthly_remaining,
                limit: monthly_cap,
                display_style: "ratio",
                reset_at: current_period_end,
                status,
                observed_at: now,
                source: "poll",
                stale: false,
                last_error: null,
            });
        }

        // 2. 5-Hour Window Limit
        const five_hour = credits_data.windowLimits?.fiveHour;
        if (five_hour && (five_hour.used !== undefined || five_hour.cap !== undefined)) {
            const used = to_number(five_hour.used);
            const limit = to_number(five_hour.cap);
            const reset_at = parse_reset_time(five_hour.resetAt);
            const exceeded = Boolean(five_hour.exceeded);
            const status: ScriptObservation["status"] = exceeded
                ? "critical"
                : limit > 0
                  ? ctx.status.for_pct((used / limit) * 100)
                  : "normal";

            results.push({
                provider: "commandcode",
                account_id,
                account_label,
                metric_id: "commandcode:five_hour",
                raw_label: "five_hour",
                normalized_label: "5小时",
                window: "second",
                cycleDurationMs: 5 * 60 * 60 * 1000,
                used,
                limit,
                display_style: "percent",
                reset_at,
                status,
                observed_at: now,
                source: "poll",
                stale: false,
                last_error: null,
            });
        }

        // 3. Weekly Window Limit
        const weekly = credits_data.windowLimits?.weekly;
        if (weekly && (weekly.used !== undefined || weekly.cap !== undefined)) {
            const used = to_number(weekly.used);
            const limit = to_number(weekly.cap);
            const reset_at = parse_reset_time(weekly.resetAt);
            const status: ScriptObservation["status"] =
                limit > 0 ? ctx.status.for_pct((used / limit) * 100) : "normal";

            results.push({
                provider: "commandcode",
                account_id,
                account_label,
                metric_id: "commandcode:weekly",
                raw_label: "weekly",
                normalized_label: "一周",
                window: "week",
                cycleDurationMs: 7 * 24 * 60 * 60 * 1000,
                used,
                limit,
                display_style: "percent",
                reset_at,
                status,
                observed_at: now,
                source: "poll",
                stale: false,
                last_error: null,
            });
        }

        return results;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.log.error(`Command Code poll failed: ${message}`);
        return [
            {
                provider: "commandcode",
                account_id: "commandcode",
                account_label: "Command Code",
                metric_id: "commandcode:status",
                raw_label: "status",
                normalized_label: "Command Code",
                window: "month",
                cycleDurationMs: null,
                used: null,
                limit: null,
                display_style: "ratio",
                reset_at: null,
                status: "critical",
                observed_at: now,
                source: "poll",
                stale: true,
                last_error: message,
            },
        ];
    }
}

void main;
