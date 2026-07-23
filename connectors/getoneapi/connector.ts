import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { ScriptObservation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function to_number(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

/** 返回有效上限（>0）；缺失/非数/≤0 返回 0（status 走 unknown）。 */
function parse_limit(raw: string | undefined): number {
    if (raw === undefined || raw.trim() === "") return 0;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

function status_for_balance(balance: number, limit: number): ScriptObservation["status"] {
    const ratio = balance / limit;
    if (ratio <= 0.1) return "critical";
    if (ratio <= 0.2) return "warning";
    return "normal";
}

async function main(): Promise<ScriptObservation[]> {
    const api_key = (ctx.params["API_KEY"] ?? "").trim();
    if (!api_key) return [];

    const limit_num = parse_limit(ctx.params["LIMIT"]);
    const limit: number | null = limit_num > 0 ? limit_num : null;
    const now = Date.now();

    const response = await ctx.http.post_json(
        "default",
        "/back/user/balance",
        {},
        {
            headers: {
                Authorization: `Bearer ${api_key}`,
                "Content-Type": "application/json",
            },
        },
    );

    if (!is_record(response)) {
        throw new Error("GetOneAPI 返回格式异常: 期望对象");
    }

    const code = response["code"];
    if (code !== 200) {
        const msg = response["message"];
        const code_str = typeof code === "number" ? String(code) : JSON.stringify(code);
        throw new Error(`GetOneAPI API 错误: ${typeof msg === "string" ? msg : code_str}`);
    }

    const data = response["data"];
    if (!is_record(data)) {
        throw new Error("GetOneAPI 返回格式异常: 缺少 data");
    }
    if (!("balance" in data)) {
        throw new Error("GetOneAPI 返回格式异常: 缺少 data.balance");
    }

    const balance = round2(to_number(data["balance"]));

    return [
        {
            provider: "getoneapi",
            account_id: "getoneapi",
            account_label: "GetOneAPI",
            metric_id: "getoneapi:balance",
            raw_label: "balance",
            normalized_label: "余额 (CNY)",
            window: "total",
            cycleDurationMs: null,
            used: balance,
            limit,
            display_style: "ratio",
            reset_at: null,
            status: limit_num > 0 ? status_for_balance(balance, limit_num) : "unknown",
            observed_at: now,
            source: "poll",
            stale: false,
            last_error: null,
        },
    ];
}

void main;
