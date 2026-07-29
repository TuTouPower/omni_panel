import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type {
    ObservationStatus,
    ObservationWindow,
    ScriptObservation,
} from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

void ctx;

interface ProductUsage {
    readonly product: string;
    readonly usagePercent?: number;
}

interface BillingPeriod {
    readonly type?: unknown;
    readonly start?: unknown;
    readonly end?: unknown;
}

interface BillingConfig {
    readonly creditUsagePercent?: unknown;
    readonly productUsage?: readonly ProductUsage[];
    readonly currentPeriod?: BillingPeriod;
    readonly billingPeriodEnd?: string;
}

interface BillingResponse {
    readonly config?: BillingConfig;
}

const ACCOUNT_ID = "grok";
const ACCOUNT_LABEL = "Grok";
const ENDPOINT_KEY = "grok_billing";
const BILLING_PATH = "/v1/billing?format=credits";

function classify_status(percent: number): ObservationStatus {
    if (percent >= 90) return "critical";
    if (percent >= 75) return "warning";
    return "normal";
}

function to_snake_case(name: string): string {
    return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function to_display_name(name: string): string {
    return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

interface ObservationPeriod {
    readonly window: ObservationWindow;
    readonly cycle_duration_ms: number;
    readonly reset_at: number | null;
}

interface TotalUsage {
    readonly percent: number;
    readonly period: ObservationPeriod;
}

const RFC3339_PATTERN =
    /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function is_leap_year(year: number): boolean {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function is_valid_calendar_date(year: number, month: number, day: number): boolean {
    const max_day = month === 2 && is_leap_year(year) ? 29 : (DAYS_IN_MONTH[month - 1] ?? 0);
    return month >= 1 && month <= 12 && day >= 1 && day <= max_day;
}

function is_valid_time(hour: number, minute: number, second: number): boolean {
    return hour <= 23 && minute <= 59 && second <= 59;
}

function is_valid_offset(hour: number, minute: number): boolean {
    return hour <= 23 && minute <= 59;
}

function parse_rfc3339(value: unknown): number | null {
    if (typeof value !== "string") return null;
    const match = RFC3339_PATTERN.exec(value);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    const offset_hour = Number(match[7] ?? 0);
    const offset_minute = Number(match[8] ?? 0);

    if (!is_valid_calendar_date(year, month, day)) return null;
    if (!is_valid_time(hour, minute, second)) return null;
    if (!is_valid_offset(offset_hour, offset_minute)) return null;

    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
}

function parse_billing_period(period: BillingPeriod | undefined): ObservationPeriod | null {
    let window: ObservationWindow;
    let cycle_duration_ms: number;
    switch (period?.type) {
        case "USAGE_PERIOD_TYPE_WEEKLY":
            window = "week";
            cycle_duration_ms = 7 * 24 * 3_600_000;
            break;
        case "USAGE_PERIOD_TYPE_MONTHLY":
            window = "month";
            cycle_duration_ms = 30 * 24 * 3_600_000;
            break;
        default:
            return null;
    }

    const start = parse_rfc3339(period.start);
    const end = parse_rfc3339(period.end);
    if (start === null || end === null || end <= start) return null;
    return { window, cycle_duration_ms, reset_at: end };
}

function get_legacy_reset_at(config: BillingConfig): number | null {
    return typeof config.billingPeriodEnd === "string" ? Date.parse(config.billingPeriodEnd) : null;
}

function get_legacy_period(config: BillingConfig): ObservationPeriod {
    return {
        window: "week",
        cycle_duration_ms: 7 * 24 * 3_600_000,
        reset_at: get_legacy_reset_at(config),
    };
}

function parse_total_usage(config: BillingConfig): TotalUsage | null {
    const billing_period = parse_billing_period(config.currentPeriod);
    const has_total_percent = Object.prototype.hasOwnProperty.call(config, "creditUsagePercent");
    if (!has_total_percent) {
        return billing_period ? { percent: 0, period: billing_period } : null;
    }
    if (
        typeof config.creditUsagePercent !== "number" ||
        !Number.isFinite(config.creditUsagePercent)
    ) {
        return null;
    }
    return {
        percent: config.creditUsagePercent,
        period: billing_period ?? get_legacy_period(config),
    };
}

async function main(): Promise<ScriptObservation[]> {
    let response: BillingResponse;
    try {
        response = (await ctx.http.get_json(ENDPOINT_KEY, BILLING_PATH)) as BillingResponse;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.report_failed_account("grok", ACCOUNT_ID, ACCOUNT_LABEL, message);
        return [];
    }

    const config = response.config;
    if (!config) {
        ctx.report_failed_account(
            "grok",
            ACCOUNT_ID,
            ACCOUNT_LABEL,
            "billing response missing config",
        );
        return [];
    }

    const now = Date.now();
    const observations: ScriptObservation[] = [];
    const total_usage = parse_total_usage(config);
    const legacy_reset_at = get_legacy_reset_at(config);

    // proto3 JSON omits zero-valued scalar fields. A complete known period with
    // no creditUsagePercent therefore means 0% used, not an unknown response.
    if (total_usage) {
        observations.push({
            provider: "grok",
            account_id: ACCOUNT_ID,
            account_label: ACCOUNT_LABEL,
            metric_id: "grok:credits",
            raw_label: "credits",
            normalized_label: "额度",
            window: total_usage.period.window,
            cycleDurationMs: total_usage.period.cycle_duration_ms,
            used: total_usage.percent,
            limit: 100,
            display_style: "percent",
            reset_at: total_usage.period.reset_at,
            status: classify_status(total_usage.percent),
            observed_at: now,
            source: "poll",
            stale: false,
            last_error: null,
        });
    }

    // 各产品额度
    if (Array.isArray(config.productUsage)) {
        for (const product of config.productUsage as readonly ProductUsage[]) {
            if (
                typeof product.usagePercent !== "number" ||
                !Number.isFinite(product.usagePercent)
            ) {
                continue;
            }
            const raw_label = to_snake_case(product.product);
            observations.push({
                provider: "grok",
                account_id: ACCOUNT_ID,
                account_label: ACCOUNT_LABEL,
                metric_id: `grok:product:${raw_label}`,
                raw_label,
                normalized_label: to_display_name(product.product),
                window: "week",
                cycleDurationMs: 7 * 24 * 3_600_000,
                used: product.usagePercent,
                limit: 100,
                display_style: "percent",
                reset_at: legacy_reset_at,
                status: classify_status(product.usagePercent),
                observed_at: now,
                source: "poll",
                stale: false,
                last_error: null,
            });
        }
    }

    // t039：HTTP 200 + config 存在但无任何可用 usage 字段时，不得静默返回空
    // observations（否则 refresh-service 误判 ready+空，清空历史、主面板"暂无账号"）。
    // 上报 failed_account，让 refresh-service 走 stale 保留 / failed 状态。
    if (observations.length === 0) {
        ctx.report_failed_account(
            "grok",
            ACCOUNT_ID,
            ACCOUNT_LABEL,
            "billing response has no usable usage fields",
        );
    }

    return observations;
}

void main;
