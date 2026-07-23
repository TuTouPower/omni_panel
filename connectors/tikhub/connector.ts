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

    const response = await ctx.http.get_json("default", "/api/v1/tikhub/user/get_user_info", {
        headers: { Authorization: `Bearer ${api_key}`, Accept: "application/json" },
    });

    if (!is_record(response)) {
        throw new Error("TikHub 返回格式异常: 期望对象");
    }

    const code = response["code"];
    if (code !== 200) {
        const msg = response["message"];
        const code_str = typeof code === "number" ? String(code) : JSON.stringify(code);
        throw new Error(`TikHub API 错误: ${typeof msg === "string" ? msg : `code=${code_str}`}`);
    }

    const user_data = response["user_data"];
    if (!is_record(user_data)) {
        throw new Error("TikHub 返回格式异常: 缺少 user_data");
    }

    const email = typeof user_data["email"] === "string" ? user_data["email"] : "";
    const account_id = email || "tikhub";
    const account_label = email || "TikHub";

    const base = {
        provider: "tikhub",
        account_id,
        account_label,
        window: "total" as const,
        cycleDurationMs: null,
        display_style: "ratio" as const,
        reset_at: null,
        observed_at: now,
        source: "poll" as const,
        stale: false,
        last_error: null,
    };

    const observations: ScriptObservation[] = [];

    if ("balance" in user_data) {
        const balance = round2(to_number(user_data["balance"]));
        observations.push({
            ...base,
            metric_id: "tikhub:balance",
            raw_label: "balance",
            normalized_label: "付费余额 (USD)",
            used: balance,
            limit,
            status: limit_num > 0 ? status_for_balance(balance, limit_num) : "unknown",
        });
    }

    if ("free_credit" in user_data) {
        const free_credit = round2(to_number(user_data["free_credit"]));
        observations.push({
            ...base,
            metric_id: "tikhub:free_credit",
            raw_label: "free_credit",
            normalized_label: "免费额度 (USD)",
            used: free_credit,
            limit: null,
            status: "unknown",
        });
    }

    if (observations.length === 0) {
        throw new Error("TikHub 返回格式异常: user_data 无 balance/free_credit");
    }

    return observations;
}

void main;
