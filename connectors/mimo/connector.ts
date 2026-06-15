import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { Observation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

interface UsageItemPayload {
    readonly name?: string;
    readonly used?: number;
    readonly limit?: number;
    readonly percent?: number;
}

interface UsagePayload {
    readonly code?: number;
    readonly message?: string;
    readonly data?: {
        readonly usage?: {
            readonly items?: UsageItemPayload[];
        };
    };
}

interface DetailPayload {
    readonly code?: number;
    readonly message?: string;
    readonly data?: {
        readonly planName?: string;
        readonly currentPeriodEnd?: string;
    };
}

interface BalancePayload {
    readonly code?: number;
    readonly data?: {
        readonly balance?: number | string;
    };
}

const DEFAULT_LIMIT = 100;

function parse_limit(raw: string | undefined): number {
    const value = Number(raw);
    return value > 0 ? value : DEFAULT_LIMIT;
}

function to_number(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function status_for_usage(used: number, limit: number): Observation["status"] {
    if (limit <= 0) return "normal";
    const ratio = used / limit;
    if (ratio >= 0.9) return "critical";
    if (ratio >= 0.75) return "warning";
    return "normal";
}

function to_reset_at(value: string | undefined): number | null {
    if (!value) return null;
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : null;
}

function label_for(name: string | undefined): string {
    if (name === "plan_total_token") return "套餐额度";
    if (name === "compensation_total_token") return "补偿积分";
    return name ?? "用量";
}

const CHROME_VERSION = "149.0.0.0";

const HEADERS = {
    "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`,
    Referer: "https://platform.xiaomimimo.com/console/plan-manage",
    Origin: "https://platform.xiaomimimo.com",
    "x-timeZone": "Asia/Shanghai",
    Accept: "*/*",
    "Accept-Language": "zh",
    "Content-Type": "application/json",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
};

async function main(): Promise<Observation[]> {
    const cookie = (ctx.params["SESSION_COOKIE"] ?? "").trim();
    if (!cookie) return [];
    const limit = parse_limit(ctx.params["LIMIT"]);
    const headers = { ...HEADERS, Cookie: cookie };
    const now = Date.now();

    const [usage_result, detail_result, balance_result] = await Promise.all([
        ctx.http
            .get_json("default", "/api/v1/tokenPlan/usage", { headers })
            .then((v) => v as UsagePayload | null)
            .catch((e: unknown) => {
                throw new Error(
                    `MiMo usage request failed: ${e instanceof Error ? e.message : String(e)}`,
                );
            }),
        ctx.http
            .get_json("default", "/api/v1/tokenPlan/detail", { headers })
            .then((v) => v as DetailPayload | null)
            .catch(() => null),
        ctx.http
            .get_json("default", "/api/v1/balance", { headers })
            .then((v) => v as BalancePayload | null)
            .catch(() => null),
    ]);

    if (usage_result?.code !== 0 || !usage_result.data?.usage?.items) {
        throw new Error(usage_result?.message ?? "MiMo usage response invalid");
    }
    if (detail_result?.code !== 0) {
        throw new Error(detail_result?.message ?? "MiMo detail response invalid");
    }

    const plan_name = detail_result.data?.planName ?? "MiMo";
    const reset_at = to_reset_at(detail_result.data?.currentPeriodEnd);

    const base = {
        provider: "mimo",
        source_instance_id: "mimo",
        account_id: "mimo",
        account_label: plan_name,
        window: "month" as const,
        display_style: "percent" as const,
        observed_at: now,
        source: "session" as const,
        stale: false,
        last_error: null,
    };

    const observations: Observation[] = usage_result.data.usage.items.map((item) => ({
        ...base,
        metric_id: `mimo:${item.name ?? "unknown"}`,
        raw_label: item.name ?? "unknown",
        normalized_label: label_for(item.name),
        used: to_number(item.used),
        limit: to_number(item.limit),
        reset_at,
        status: status_for_usage(to_number(item.used), to_number(item.limit)),
    }));

    if (balance_result?.code === 0 && balance_result.data) {
        const balance = to_number(balance_result.data.balance);
        if (Number.isFinite(balance)) {
            observations.push({
                ...base,
                metric_id: "mimo:balance",
                raw_label: "balance",
                normalized_label: "余额",
                used: Math.round(balance * 100) / 100,
                limit: Math.round(limit * 100) / 100,
                window: "total",
                display_style: "ratio",
                reset_at: null,
                status: balance >= 0 ? "normal" : "critical",
            });
        }
    }

    return observations;
}

void main;
