import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { ScriptObservation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

interface QuotaLimit {
    readonly unit?: number;
    readonly number?: number;
    readonly name?: string;
    readonly percentage?: number;
    readonly currentValue?: number;
    readonly usage?: number;
    readonly nextResetTime?: number;
    readonly nextResetTimestamp?: number;
    readonly resetTime?: number;
    readonly resetAt?: number;
    readonly expireTime?: number;
    readonly expiresAt?: number;
}

interface QuotaResponse {
    readonly code?: number;
    readonly msg?: string;
    readonly success?: boolean;
    readonly data?: {
        readonly limits?: QuotaLimit[];
    };
}

function to_number(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function period_key(limit: QuotaLimit): "5h" | "week" | "month" | null {
    const unit = to_number(limit.unit);
    const number = to_number(limit.number);
    if (unit === 3 && number === 5) return "5h";
    if (unit === 6 && number === 1) return "week";
    if (unit === 5 && number === 1) return "month";
    return null;
}

function kind_for(limit: QuotaLimit): "text" | "tool" {
    const record = limit as unknown as Record<string, unknown>;
    if (record["currentValue"] !== undefined || record["usage"] !== undefined) return "tool";
    const name_raw = record["name"];
    const name = (typeof name_raw === "string" ? name_raw : "").toLowerCase();
    if (
        name.includes("tool") ||
        name.includes("工具") ||
        name.includes("function") ||
        name.includes("mcp")
    ) {
        return "tool";
    }
    return "text";
}

function reset_at_from(limit: QuotaLimit): number | null {
    const candidates = [
        limit.nextResetTime,
        limit.nextResetTimestamp,
        limit.resetTime,
        limit.resetAt,
        limit.expireTime,
        limit.expiresAt,
    ];
    for (const candidate of candidates) {
        const raw = to_number(candidate);
        if (raw <= 0) continue;
        return raw > 1e12 ? raw : raw * 1000;
    }
    return null;
}

function status_for(used: number, limit: number, is_percent: boolean): ScriptObservation["status"] {
    if (is_percent) {
        if (used >= 90) return "critical";
        if (used >= 75) return "warning";
        return "normal";
    }
    if (limit <= 0) return "normal";
    const ratio = used / limit;
    if (ratio >= 0.9) return "critical";
    if (ratio >= 0.75) return "warning";
    return "normal";
}

async function main(): Promise<ScriptObservation[]> {
    const api_key = (ctx.params["API_KEY"] ?? "").trim();
    if (!api_key) return [];

    const response = (await ctx.http.get_json("default", "/api/monitor/usage/quota/limit", {
        headers: { "Content-Type": "application/json", Authorization: api_key },
    })) as QuotaResponse | null;

    if (response?.code !== undefined && response.code !== 200) {
        throw new Error(`智谱 API 错误: ${response.msg ?? String(response.code)}`);
    }

    const limits = response?.data?.limits;
    if (!Array.isArray(limits)) {
        throw new Error("智谱 API 返回格式异常: 缺少 limits");
    }

    const now = Date.now();
    const observations: ScriptObservation[] = [];

    for (const limit of limits) {
        if (!is_record(limit)) continue;
        const pk = period_key(limit);
        if (!pk) continue;
        const kind = kind_for(limit);
        const record = limit;
        const total = to_number(record["usage"]);
        if (kind === "tool") {
            const current = to_number(record["currentValue"]);
            if (total <= 0) continue;
            const normalized_label = pk === "month" ? "MCP 月用量" : `${kind}(${pk})`;
            observations.push({
                provider: "glm",
                account_id: "glm",
                account_label: "智谱 GLM",
                metric_id: `glm:${kind}-${pk}`,
                raw_label: `${kind}-${pk}`,
                normalized_label,
                window: pk === "month" ? "month" : pk === "week" ? "day" : "second",
                cycleDurationMs:
                    pk === "month"
                        ? 30 * 24 * 3_600_000
                        : pk === "week"
                          ? 7 * 24 * 3_600_000
                          : 5 * 3_600_000,
                used: current,
                limit: total,
                display_style: "ratio",
                reset_at: reset_at_from(limit),
                status: status_for(current, total, false),
                observed_at: now,
                source: "poll",
                stale: false,
                last_error: null,
            });
        } else {
            const percentage = Math.min(Math.max(to_number(record["percentage"]), 0), 100);
            const normalized_label =
                pk === "5h" ? "5小时" : pk === "week" ? "一周" : `${kind}(${pk})`;
            observations.push({
                provider: "glm",
                account_id: "glm",
                account_label: "智谱 GLM",
                metric_id: `glm:${kind}-${pk}`,
                raw_label: `${kind}-${pk}`,
                normalized_label,
                window: pk === "5h" ? "second" : pk === "month" ? "month" : "day",
                cycleDurationMs:
                    pk === "5h"
                        ? 5 * 3_600_000
                        : pk === "month"
                          ? 30 * 24 * 3_600_000
                          : 7 * 24 * 3_600_000,
                used: percentage,
                limit: 100,
                display_style: "percent",
                reset_at: reset_at_from(limit),
                status: status_for(percentage, 100, true),
                observed_at: now,
                source: "poll",
                stale: false,
                last_error: null,
            });
        }
    }

    return observations;
}

void main;
