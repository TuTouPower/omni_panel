import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { ScriptObservation } from "../../src/shared/types/observation";
import type { ObservationStatus } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

void ctx;

interface ProductUsage {
    readonly product: string;
    readonly usagePercent?: number;
}

interface BillingConfig {
    readonly creditUsagePercent?: number;
    readonly productUsage?: readonly ProductUsage[];
    readonly billingPeriodEnd?: string;
}

interface BillingResponse {
    readonly config?: BillingConfig;
}

const ACCOUNT_ID = "grok";
const ACCOUNT_LABEL = "SuperGrok";
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

    const reset_at = config.billingPeriodEnd ? Date.parse(config.billingPeriodEnd) : null;
    const now = Date.now();
    const observations: ScriptObservation[] = [];

    // 总额度
    const total_percent = config.creditUsagePercent;
    if (typeof total_percent === "number" && Number.isFinite(total_percent)) {
        observations.push({
            provider: "grok",
            account_id: ACCOUNT_ID,
            account_label: ACCOUNT_LABEL,
            metric_id: "grok:credits",
            raw_label: "credits",
            normalized_label: "额度",
            window: "week",
            cycleDurationMs: 7 * 24 * 3_600_000,
            used: total_percent,
            limit: 100,
            display_style: "percent",
            reset_at,
            status: classify_status(total_percent),
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
                reset_at,
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
