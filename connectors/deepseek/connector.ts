import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { Observation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

interface BalanceInfo {
    readonly currency?: string;
    readonly total_balance?: string | number;
}

interface BalanceResponse {
    readonly balance_infos?: BalanceInfo[];
}

const DEFAULT_LIMIT = 100;

function parse_limit(raw: string | undefined): number {
    const value = Number(raw);
    return value > 0 ? value : DEFAULT_LIMIT;
}

function to_number(value: string | number | undefined): number {
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function status_for_balance(balance: number, limit: number): Observation["status"] {
    if (limit <= 0) return "normal";
    const ratio = balance / limit;
    if (ratio <= 0.1) return "critical";
    if (ratio <= 0.2) return "warning";
    return "normal";
}

async function main(): Promise<Observation[]> {
    const api_key = (ctx.params["API_KEY"] ?? "").trim();
    if (!api_key) return [];

    const limit = parse_limit(ctx.params["LIMIT"]);
    const rounded_limit = Math.round(limit * 100) / 100;

    const response = (await ctx.http.get_json("default", "/user/balance", {
        headers: { Accept: "application/json", Authorization: `Bearer ${api_key}` },
    })) as BalanceResponse | null;

    const infos = response?.balance_infos ?? [];
    const now = Date.now();

    return infos.map((info) => {
        const currency = info.currency ?? "";
        const balance = to_number(info.total_balance);
        const suffix = currency !== "CNY" && currency ? ` (${currency})` : "";
        return {
            provider: "deepseek",
            source_instance_id: "deepseek",
            account_id: "deepseek",
            account_label: "DeepSeek",
            metric_id: `deepseek:balance-${currency}`,
            raw_label: `balance-${currency}`,
            normalized_label: `余额${suffix}`,
            window: "total",
            used: Math.round(balance * 100) / 100,
            limit: rounded_limit,
            display_style: "ratio",
            reset_at: null,
            status: status_for_balance(balance, limit),
            observed_at: now,
            source: "poll",
            stale: false,
            last_error: null,
        } satisfies Observation;
    });
}

void main;
