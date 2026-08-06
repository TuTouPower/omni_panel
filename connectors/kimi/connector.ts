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

interface BoosterWallet {
    readonly status?: string;
    readonly balance?: { readonly amountLeft?: string };
}

interface UserInfo {
    readonly membership?: { readonly level?: string };
}

interface KimiUsageResponse {
    readonly usage?: UsageDetail;
    readonly limits?: readonly RateLimitWindow[];
    readonly boosterWallet?: BoosterWallet;
    readonly user?: UserInfo;
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

// Booster wallet balance is denominated in 1e-8 yuan (KimiCodeBarQuotaService.swift).
const BOOSTER_AMOUNT_DIVISOR = 100_000_000;
const MONTH_CYCLE_MS = 30 * 24 * 60 * 60 * 1000;

function booster_balance_yuan(wallet: BoosterWallet): number {
    // Only STATUS_ACTIVE / STATUS_ENABLED report the true remaining balance; other
    // statuses return a misleading (monthly limit − used) value that must be 0.
    const status = (wallet.status ?? "STATUS_UNKNOWN").toUpperCase();
    const enabled = status === "STATUS_ACTIVE" || status === "STATUS_ENABLED";
    if (!enabled) return 0;
    const amount_left = to_number(wallet.balance?.amountLeft);
    return Math.max(0, amount_left / BOOSTER_AMOUNT_DIVISOR);
}

async function main(): Promise<ScriptObservation[]> {
    // Token precedence: OAuth access token (device-code login) → API Key fallback.
    // Either is accepted as a Bearer credential by the Kimi quota API.
    const oauth_token = (ctx.params["OAUTH_TOKEN"] ?? "").trim();
    const api_key = (ctx.params["API_KEY"] ?? "").trim();
    const token = oauth_token || api_key;
    if (!token) {
        throw new Error("Missing required secret: OAUTH_TOKEN or API_KEY");
    }

    const response = (await ctx.http.get_json("default", "coding/v1/usages", {
        headers: {
            Authorization: `Bearer ${token}`,
            "User-Agent": "KimiCLI/1.6",
        },
    })) as KimiUsageResponse | null;

    const now = Date.now();
    const results: ScriptObservation[] = [];

    // Membership level decorates the account label so it surfaces on every metric.
    const membership_level = response?.user?.membership?.level?.trim();
    const account_label = membership_level ? `Kimi（${membership_level}）` : "Kimi";

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
            account_label,
            metric_id: "kimi:weekly",
            raw_label: "weekly",
            normalized_label: "一周",
            window: "day",
            cycleDurationMs: cycle_duration_ms,
            used,
            limit,
            display_style: "percent",
            reset_at,
            status: limit > 0 ? ctx.status.for_pct((used / limit) * 100) : "normal",
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
            account_label,
            metric_id: "kimi:five_hour",
            raw_label: "five_hour",
            normalized_label: "5小时",
            window: "second",
            cycleDurationMs: cycle_duration_ms,
            used,
            limit,
            display_style: "percent",
            reset_at,
            status: limit > 0 ? ctx.status.for_pct((used / limit) * 100) : "normal",
            observed_at: now,
            source: "poll",
            stale: false,
            last_error: null,
        });
    }

    // 加油包余额（boosterWallet）。display_style: ratio + limit=0 复用 t097
    // 「ratio 无 limit 显示原值」行为呈现余额（元）；不参与阈值，仅展示。
    if (response?.boosterWallet) {
        const balance_yuan = booster_balance_yuan(response.boosterWallet);
        results.push({
            provider: "kimi",
            account_id: "kimi",
            account_label,
            metric_id: "kimi:booster_balance",
            raw_label: "booster_balance",
            normalized_label: "加油包余额",
            window: "month",
            cycleDurationMs: MONTH_CYCLE_MS,
            used: balance_yuan,
            limit: 0,
            display_style: "ratio",
            reset_at: null,
            status: "normal",
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
